/* Duino-Coin Pool Sync handler
For documention about these functions see
https://github.com/revoxhere/duino-coin/blob/useful-tools
2019-2021 Duino-Coin community */

const net = require("net");
const axios = require("axios");
const fs = require("fs");
const osu = require("node-os-utils");

const dns = require('dns');
const log = require("./logging");
const FormData = require('form-data');
const {
    poolID,
    poolVersion,
    serverIP,
    poolName,
    serverPort,
    base_sync_folder,
    syncTime,
    server_sync_url,
    timeout,
    use_ngrok
} = require("../config/config.json");

const SYNC_TIME = syncTime * 1000;
const TIMEOUT = timeout * 1000;

let ip, port, sync_count = 0;
let poolRewards = {};
let serverMiners = {};

const wait = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}

const dns_lookup = async (ip) => {
    return new Promise((resolve, reject) => {
        dns.lookup(ip, (err, address) => {
            if (err)
                reject(err);
            resolve(address);
        });
    });
};

const get_ngrok_ip = async () => {
    while (true) {
        try {
            let res = await axios.get(
                    "http://localhost:4040/api/tunnels/command_line", {
                    timeout: TIMEOUT
                });

            content = res.data.public_url.split(":");
            ip = await dns_lookup(content[1].replace("//", ""));
            port = content[2];

            log.info(`Fetched ngrok IP: ${ip}:${port}`);
            break;
        } catch (err) {
           log.error(`Can't fetch ngrok IP: ${err}`);
        }
        await wait(3000);
    }
}

const get_pool_ip = async () => {
    while (true) {
        try {
            let res = await axios.get(
                    "https://api.ipify.org", {
                    timeout: TIMEOUT
                });

            ip = res.data;
            port = require("../config/config.json").port;

            log.info(`Fetched pool IP: ${ip}:${port}`);
            break;
        } catch (err) {
            log.error(`Can't fetch pool IP: ${err}`);
        }
        await wait(3000);
    }
}

const login = async () => {
    if (use_ngrok)
        await get_ngrok_ip();
    else
        await get_pool_ip();

    const loginInfos = {
        host: ip,
        port: port,
        version: poolVersion,
        identifier: poolID,
        name: poolName
    };

    const socket = new net.Socket();
    try {
        socket.setEncoding("utf-8");
        socket.setTimeout(TIMEOUT);
        socket.connect(serverPort, serverIP);
    } catch (err) {
        log.error(`Socket error at connect: ${err}`);
    }

    socket.on("error", (err) => {
        log.error(`Socket error at login: ${err}`);
    });

    socket.on("timeout", () => {
        log.error("Socket timeout at login");
    });

    socket.on("data", (data) => {
        if (data.startsWith("2")) {
            socket.write(`PoolLogin,${JSON.stringify(loginInfos)}`);
        } else if (data === "LoginOK") {
            log.success("Successfully logged in");
            socket.destroy();
        } else {
            log.warning(`Unknown error, server returned ${data} in login`);
            process.exit(-1)
        }
    });

    sync();
    //updateMinerCount();
}

const logout = () => {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        try {
            socket.setEncoding("utf-8");
            socket.setTimeout(TIMEOUT);
            socket.connect(serverPort, serverIP);
        } catch (err) {
            log.error(`Socket error at connect: ${err}`);
        }

        socket.on("error", (err) => {
            log.error(`Socket error at logout: ${err}`);
            reject(1);
        });

        socket.on("timeout", () => {
            log.error(`Socket timeout at logout`);
            reject(1);
        });

        socket.on("data", (data) => {
            if (data.startsWith("2")) {
                socket.write(`PoolLogout,${poolID}`);
            } else if (data === "LogoutOK") {
                log.success("Successfully logged out");
                resolve();
            } else {
                log.warning(`Unknown error, server returned ${data} in logout`);
                reject(data);
            }
        });
    });
}

const sync = async () => {
    const mining = require("./mining");
    const blockIncrease = mining.stats.globalShares.increase;
    require("./index");

    if (use_ngrok && sync_count > 0 && sync_count % 50 == 0)
    await get_ngrok_ip();
    
    const cpuUsage = await osu.cpu.usage();
    let ramUsage = await osu.mem.info();
    ramUsage = 100 - ramUsage.freeMemPercentage;

    mining.stats.globalShares.increase = 0;
    const syncData = {
        blocks: {
            "blockIncrease": blockIncrease,
            "bigBlocks": globalBlocks
        },
        cpu: cpuUsage,
        ram: ramUsage,
        connections: connections
    }

    fs.writeFileSync(`${base_sync_folder}/workers_${poolName}.json`, JSON.stringify(mining.stats.minersStats, null, 0));
    fs.writeFileSync(`${base_sync_folder}/rewards_${poolName}.json`, JSON.stringify(mining.stats.balancesToUpdate, null, 0));
    // fs.writeFileSync(`${base_sync_folder}/statistics_${poolName}.json`, JSON.stringify(syncData, null, 0));

    const request_url = `https://${serverIP}/pool_sync/`
         + `?host=${ip}&port=${port}&version=${poolVersion}`
         + `&identifier=${poolID}&name=${poolName}`
         + `&blockIncrease=${blockIncrease}&bigBlocks=${globalBlocks}`
         + `&cpu=${cpuUsage}&ram=${ramUsage}&connections=${connections}`;

    let form = new FormData();
    form.append('rewards', fs.readFileSync(`${base_sync_folder}/rewards_${poolName}.json`), `rewards_${poolName}.json`);
    form.append('workers', fs.readFileSync(`${base_sync_folder}/workers_${poolName}.json`), `workers_${poolName}.json`);
    // form.append('statistics', fs.readFileSync(`${base_sync_folder}/statistics_${poolName}.json`), `rewards_${poolName}.json`);

    try {
        sync_count++;
        axios.post(request_url, form, {
            headers: {
                ...form.getHeaders(),
                'Content-Type': 'multipart/form-data'
            }
        })
        .then(response => {
            if (response && response.data.success) {
                Object.keys(mining.stats.balancesToUpdate).forEach(k => {
                    delete mining.stats.balancesToUpdate[k];
                });
                globalBlocks = [];
                log.success(`Successfull sync #${sync_count}`);
            } else {
                log.warning(`Server error at sync #${sync_count}: ${response.data.message}`);
            }
        })
        .catch((err) => {
            log.error(`Socket error while syncing: ${err}`);
        });
    } catch (err) {
        log.error(`Error while syncing: ${err}`);
    }

    setTimeout(sync, SYNC_TIME);
}

const updatePoolReward = () => {
    axios.get(`${server_sync_url}/poolrewards.json`, {
        timeout: SYNC_TIME
    })
    .then(response => {
        poolRewards = response.data;
        fs.writeFileSync('./config/poolRewards.json', JSON.stringify(poolRewards, null, 2));
        log.success("Updated pool rewards file");
    })
    .catch((err) => {
        log.error(`Error updating pool rewards file: ${err}`);
    });

    let bans = JSON.parse(fs.readFileSync('./config/bans.json', 'utf8'));
    axios.get(`${server_sync_url}/bans.json`, {
        timeout: TIMEOUT
    })
    .then(response => {
        bans.bannedUsernames = response.data;
        fs.writeFileSync('./config/bans.json', JSON.stringify(bans, null, 2));
        log.success("Updated bans file");
    })
    .catch((err) => {
        log.error(`Error updating bans file: ${err}`);
    });
}

const updateMinerCount = () => {
    axios.get('https://server.duinocoin.com/statistics_miners', {
        timeout: TIMEOUT
    })
    .then(response => {
        serverMiners = response.data.result;
        fs.writeFileSync('./config/serverMiners.json', JSON.stringify(response.data.result, null, 2));
        log.success("Updated miner count file");
    })
    .catch((err) => {
        log.error(`Error updating miner count file: ${err}`);
    });

    //setTimeout(updateMinerCount, SYNC_TIME);
}

module.exports = {
    login,
    logout,
    updatePoolReward,
    poolRewards,
    serverMiners
};
