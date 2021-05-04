const net = require("net");

const handle = require("./handleConnection");
const sync = require("./sync");
const mining = require("./mining");

const { port, host } = require("../config/config.json");

sync.login();
sync.updatePoolReward();
mining.generateJobs();

const server = net.createServer(handle);

server.listen(port, host, () => {
    console.log(`Server listening on port ${port}\n`);
})

process.once("SIGINT", async () => { // catch SIGINT
    console.log("SIGINT detected, closing the server and logging out the pool...");
    await sync.logout(); // log out the pool from the server, so it doesn't appear online
    server.close();
    console.log("done");
    process.exit(0);
})

process.once("SIGTERM", async () => { // catch SIGTERM
    console.log("SIGTERM detected, closing the server and logging out the pool...");
    await sync.logout(); // log out the pool from the server, so it doesn't appear online
    server.close();
    console.log("done");
    process.exit(0);
})