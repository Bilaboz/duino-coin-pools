/* Duino-Coin Pool
For documention about these functions see
https://github.com/revoxhere/duino-coin/blob/useful-tools
2019-2021 Duino-Coin community */

const net = require("net");
const handle = require("./connectionHandler");
const sync = require('./sync');
const mining = require("./mining");

const {
    poolID,
    poolName,
    port,
    host
} = require("../config/config.json");

connections = 0;

sync.login();
sync.updatePoolReward();
require("./dashboard");

const server = net.createServer(handle);

server.listen(port, host, () => {
    console.log(`Server listening on port ${port}\n`);
})

process.once("SIGINT", async() => { // catch SIGINT
    console.log("SIGINT detected, closing the server and logging out the pool...");
    await sync.logout(); // log out the pool from the server, so it doesn't appear online
    server.close();
    process.exit(0);
})

process.once("SIGTERM", async() => { // catch SIGTERM
    console.log("SIGTERM detected, closing the server and logging out the pool...");
    await sync.logout(); // log out the pool from the server, so it doesn't appear online
    server.close();
    process.exit(0);
})

setInterval(() => {
    server.getConnections((error, count) => {
        if (!error) {
            connections = count;
            console.log(`${poolName}: ${new Date().toLocaleString()} - Connected clients: ${count}`);
        }
    });
}, 10000);
