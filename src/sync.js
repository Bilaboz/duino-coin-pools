/* Duino-Coin Pool Sync handler
For documention about these functions see
https://github.com/revoxhere/duino-coin/blob/useful-tools
2019-2021 Duino-Coin community */

const net = require("net");
const axios = require("axios");
const fs = require("fs");
const osu = require("node-os-utils");

const FormData = require('form-data');
const dns = require('dns');

const chalk = require('chalk');
const error = chalk.bold.red;
const info = chalk.blue;
const success = chalk.green;
const warning = chalk.hex('#FFA500');

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
let ip, port, sync_count = 0;
const SYNC_TIME = syncTime * 1000;
const TIMEOUT = timeout * 1000;

function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function dns_lookup(ip) {
    return new Promise((resolve, reject) => {
        dns.lookup(ip, (err, address, family) => {
            if (err)
                reject(err);
            resolve(address);
        });
    });
};

async function get_ngrok_ip() {
    while (true) {
        try {
            let res = await axios.get(
                    "http://localhost:4040/api/tunnels/command_line", {
                    timeout: TIMEOUT
                });

            content = res.data.public_url.split(":");
            ip = await dns_lookup(content[1].replace("//", ""));
            port = content[2];

            console.log(`${poolName}: ${new Date().toLocaleString()} ` + info(`Fetched ngrok IP: ${ip}:${port}`));
            break;
        } catch (err) {
            console.log(`${poolName}: ${new Date().toLocaleString()} ` + error(`Can't fetch ngrok IP: ${err}`));
        }
        await wait(3000);
    }
}

async function get_pool_ip() {
    while (true) {
        try {
            let res = await axios.get(
                    "https://api.ipify.org", {
                    timeout: TIMEOUT
                });

            ip = res.data;
            port = require("../config/config.json");

            console.log(`${poolName}: ${new Date().toLocaleString()} ` + info(`Fetched pool IP: ${ip}:${port}`));
            break;
        } catch (err) {
            console.log(`${poolName}: ${new Date().toLocaleString()} ` + error(`Can't fetch pool IP: ${err}`));
        }
        await wait(3000);
    }
}

async function login() {
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
        console.log(`${poolName}: ${new Date().toLocaleString()}` + error(` Socket error at connect: ${err}`));
    }

    socket.on("error", (err) => {
        console.log(`${poolName}: ${new Date().toLocaleString()}` + error(` Socket error at login: ${err}`));
        process.exit(-1);
    });

    socket.on("timeout", () => {
        console.log(`${poolName}: ${new Date().toLocaleString()}` + error(` Socket timeout at login`));
        process.exit(-1);
    });

    socket.on("data", (data) => {
        if (data.startsWith("2")) {
            socket.write(`PoolLogin,${JSON.stringify(loginInfos)}`);
        } else if (data === "LoginOK") {
            console.log(`${poolName}: ${new Date().toLocaleString()}` + success(` Successfully logged in`));
            socket.destroy();
            sync();
            updateMinerCount();
        } else {
            console.log(`${poolName}: ${new Date().toLocaleString()}` + warning(` Unknown error, server returned ${data} in login`));
            process.exit(-1)
        }
    })
}

function logout() {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        try {
            socket.setEncoding("utf-8");
            socket.setTimeout(TIMEOUT);
            socket.connect(serverPort, serverIP);
        } catch (err) {
            console.log(`${poolName}: ${new Date().toLocaleString()}` + error(` Socket error at connect: ${err}`));
        }

        socket.on("error", (err) => {
            console.log(`${poolName}: ${new Date().toLocaleString()}` + error(` Socket error at logout: ${err}`));
            reject(1);
        });

        socket.on("timeout", () => {
            console.log(`${poolName}: ${new Date().toLocaleString()}` + error(` Socket timeout at logout`));
            reject(1);
        });

        socket.on("data", (data) => {
            if (data.startsWith("2")) {
                socket.write(`PoolLogout,${poolID}`);
            } else if (data === "LogoutOK") {
                console.log(`${poolName}: ${new Date().toLocaleString()}` + success(` Successfully logged out`));
                resolve();
            } else {
                console.log(`${poolName}: ${new Date().toLocaleString()}` + warning(` Unknown error, server returned ${data} in logout`));
                reject(data);
            }
        })
    })
}

async function sync() {
    const cpuUsage = await osu.cpu.usage();
    const mining = require("./mining");
    const blockIncrease = mining.stats.globalShares.increase;
    require("./index");
    if (use_ngrok && sync_count > 0 && sync_count % 50 == 0)
        await get_ngrok_ip();

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

    fs.writeFileSync(`dashboard/workers_${poolName}.json`, JSON.stringify(mining.stats.minersStats, null, 0));
    fs.writeFileSync(`dashboard/rewards_${poolName}.json`, JSON.stringify(mining.stats.balancesToUpdate, null, 0));
    // fs.writeFileSync(`dashboard/statistics_${poolName}.json`, JSON.stringify(syncData, null, 0));

    let request_url = `https://${serverIP}/pool_sync/`
         + `?host=${ip}&port=${port}&version=${poolVersion}`
         + `&identifier=${poolID}&name=${poolName}`
         + `&blockIncrease=${blockIncrease}&bigBlocks=${globalBlocks}`
         + `&cpu=${cpuUsage}&ram=${ramUsage}&connections=${connections}`;

    let form = new FormData();
    form.append('rewards', fs.readFileSync(`dashboard/workers_${poolName}.json`), `workers_${poolName}.json`);
    form.append('workers', fs.readFileSync(`dashboard/workers_${poolName}.json`), `rewards_${poolName}.json`);
    // form.append('statistics', fs.readFileSync(`dashboard/statistics_${poolName}.json`), `rewards_${poolName}.json`);

    try {
        sync_count += 1;
        axios.post(request_url, form, {
            headers: {
                ...form.getHeaders(),
                'Content-Type': 'multipart/form-data'
            }
        })
        .then(response => {
            if (response) {
                if (response.data.success) {
                    Object.keys(mining.stats.balancesToUpdate).forEach(k => {
                        delete mining.stats.balancesToUpdate[k];
                    });
                    globalBlocks = [];
                    console.log(`${poolName}: ${new Date().toLocaleString()}` + success(` Successfull sync #${sync_count}`));
                } else {
                    console.log(`${poolName}: ${new Date().toLocaleString()}` + warning(` Server error at sync #${sync_count}: ${response.data.message}`));
                }
            }
        })
        .catch(function (err) {
            console.log(`${poolName}: ${new Date().toLocaleString()}` + error(` Socket error while syncing: ${err}`));
        })
    } catch (err) {
        console.log(`${poolName}: ${new Date().toLocaleString()}` + error(` Error while syncing: ${err}`));
    }

    setTimeout(sync, SYNC_TIME);
}

function updatePoolReward() {
    axios.get(`${server_sync_url}/poolrewards.json`, {
        timeout: SYNC_TIME
    })
    .then(response => {
        fs.writeFileSync('./config/poolRewards.json', JSON.stringify(response.data, null, 2));
        console.log(`${poolName}: ${new Date().toLocaleString()}` + success(` Updated pool rewards file`));
    })
    .catch(function (err) {
        console.log(`${poolName}: ${new Date().toLocaleString()}` + error(` Error updating pool rewards file: ${err}`));
    });

    bans = require('../config/bans.json');
    axios.get(`${server_sync_url}/bans.json`, {
        timeout: TIMEOUT
    })
    .then(response => {
        bans.bannedUsernames = response.data;

        fs.writeFileSync('./config/bans.json', JSON.stringify(bans, null, 2));
        console.log(`${poolName}: ${new Date().toLocaleString()}` + success(` Updated bans file`));
    })
    .catch(function (err) {
        console.log(`${poolName}: ${new Date().toLocaleString()}` + error(` Error updating bans file: ${err}`));
    });

    setTimeout(updatePoolReward, SYNC_TIME * 10);
}

function updateMinerCount() {
    axios.get('https://server.duinocoin.com/statistics_miners', {
        timeout: TIMEOUT
    })
    .then(response => {
        fs.writeFileSync('./config/serverMiners.json', JSON.stringify(response.data.result, null, 2));
        console.log(`${poolName}: ${new Date().toLocaleString()}` + success(` Updated miner count file`));
    })
    .catch(function (err) {
        console.log(`${poolName}: ${new Date().toLocaleString()}` + error(` Error updating miner count file: ${err}`));
    });

    setTimeout(updateMinerCount, SYNC_TIME / 2);
}

module.exports = {
    login,
    logout,
    updatePoolReward
};
