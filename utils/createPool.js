const net = require("net");
const axios = require("axios"); 

const { poolID, poolName, poolPassword, serverIP, serverPort, port } = require("../config/config.json");

async function createPool() {
    const res = await axios.get("https://api.ipify.org/");
    if (!res.data) {
        console.log("Error: can't get the pool IP");
        process.exit(1);
    }
    const ip = res.data;

    const loginInfos = {
        name: poolID,
        host: ip,
        port: port,
        identifier: poolName,
        hidden: "False"
    };

    const socket = new net.Socket();
    socket.setEncoding("utf-8");
    socket.connect(serverPort, serverIP);

    socket.on("error", (err) => {
        console.log(`Socket error at createPool: ${err}`);
        process.exit(-1);
    });

    socket.on("timeout", () => {
        console.log("Socket timeout at createPool");
        process.exit(-1);
    });

    socket.on("data", (data) => {
        console.log(data);
        if (data.startsWith("2")) {
            socket.write(`PoolLoginAdd,${poolPassword},${JSON.stringify(loginInfos)}`);
        } else if (data === "LoginOK") {
            console.log("Pool successfully added");
        } else {
            console.log(`Unknown error, server returned ${data} in createPool`);
            process.exit(-1);
        }
    });
}

createPool();
