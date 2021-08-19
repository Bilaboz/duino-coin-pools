const net = require("net");
const axios = require("axios");
const fs = require("fs");
const osu = require("node-os-utils");

const { poolID, poolVersion, port, serverIP, serverPort } = require("../config/config.json");
let ip;
const SYNC_TIME = 10 * 1000;
const TIMEOUT = 20 * 1000;

async function login() {
    const res = await axios.get("https://api.ipify.org/");
    if (!res.data) {
        console.log("Error: can't get the pool IP");
        process.exit(-1);
    }
    ip = res.data;

    const loginInfos = {
        host: ip,
        port: port,
        version: poolVersion,
        identifier: poolID
    };

    const socket = new net.Socket();
    socket.setEncoding("utf-8");
    socket.setTimeout(TIMEOUT);
    socket.connect(serverPort, serverIP);

    socket.on("error", (err) => {
        console.log(`Socket error at login: ${err}`);
        process.exit(-1);
    });

    socket.on("timeout", () => {
        console.log("Socket timeout at login");
        process.exit(-1);
    });

    socket.on("data", (data) => {
        if (data.startsWith("2")) {
            socket.write(`PoolLogin,${JSON.stringify(loginInfos)}`);
        } else if (data === "LoginOK") {
            console.log("Pool successfully logged in");
            socket.destroy();
            sync();
        } else {
            console.log(`Unknown error, server returned ${data} in login`);
            process.exit(-1)
        }
    })
}

function logout() {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        socket.setEncoding("utf-8");
        socket.connect(serverPort, serverIP);
    
        socket.on("error", (err) => {
            console.log(`Socket error at logout: ${err}`);
            reject(1);
        });
    
        socket.on("timeout", () => {
            console.log("Socket timeout at logout");
            reject(1);
        });
    
        socket.on("data", (data) => {
            console.log(data)
            if (data.startsWith("2")) {
                socket.write(`PoolLogout,${poolID}`);
            } else if (data === "LogoutOK") {
                console.log("Pool successfully logged out")
                resolve();
            } else {
                console.log(`Unknown error, server returned ${data} in logout`);
                reject(data);
            }
        })
    })
}

function updatePoolReward() {
    axios({
        method: "get",
        url: "https://server.duinocoin.com/PoolRewards.json",
        responseType: "stream"
    }).then((response) => {
        response.data.pipe(fs.createWriteStream("./config/poolRewards.json"))
        
        response.data.on("error", (err) => {
            console.log(`Error downloading poolRewards.json: ${err}`);
        });
    
        response.data.on("end", () => {
            console.log("Updated poolRewards.json")
        });
    });

    setTimeout(updatePoolReward, 120000)
}

async function sync() {
    const mining = require("./mining");
    require("./index");

    const cpuUsage = await osu.cpu.usage();
    let ramUsage =  await osu.mem.info();
    ramUsage = 100 - ramUsage.freeMemPercentage;

    const blockIncrease = mining.stats.globalShares.increase;
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

    fs.writeFile(__dirname + "/../dashboard/workers.json", JSON.stringify(mining.stats.minersStats, null, 4), () => {});
    fs.writeFile(__dirname + "/../dashboard/rewards.json", JSON.stringify(mining.stats.balancesToUpdate, null, 4), () => {});
    fs.writeFile(__dirname + "/../dashboard/statistics.json", JSON.stringify(syncData, null, 4), () => {});


    const loginInfos = {
        host: ip,
        port: port,
        version: poolVersion,
        identifier: poolID
    };

    const socket = new net.Socket();
    socket.setEncoding("utf-8");
    socket.setTimeout(TIMEOUT);
    socket.connect(serverPort, serverIP);

    socket.on("error", (err) => {
        console.log(`Socket error at sync: ${err}`);
    });

    socket.on("timeout", () => {
        console.log("Socket timeout at sync");
    });

    socket.on("data", (data) => {
        if (data.startsWith("2")) {
            socket.write(`PoolLogin,${JSON.stringify(loginInfos)}`);  
        } else if (data === "LoginOK") {
            socket.write(`PoolSync,${JSON.stringify(syncData)}`);
            //console.log(syncData)
        } else if (data === "SyncOK") {
            socket.end();
            Object.keys(mining.stats.balancesToUpdate).forEach(k =>{
                delete mining.stats.balancesToUpdate[k];
            });
            globalBlocks = [];

            console.log(poolID +` - ${new Date().toLocaleString()} - Successfull sync`);
        } else {
            console.log(`Unknown error, server returned ${data} in sync`);
        }
    });

    setTimeout(sync, SYNC_TIME)
}

module.exports = { login, logout, updatePoolReward };
