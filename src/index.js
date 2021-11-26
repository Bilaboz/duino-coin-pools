/* Duino-Coin Pool
For documention about these functions see
https://github.com/revoxhere/duino-coin/blob/useful-tools
2019-2021 Duino-Coin community */

const net = require("net");
const handle = require("./connectionHandler");
const sync = require('./sync');
const mining = require("./mining");
const {
    spawn
} = require("child_process");

const chalk = require('chalk');
const error = chalk.bold.red;
const info = chalk.blue;
const success = chalk.green;
const warning = chalk.hex('#FFA500');

const {
    use_ngrok,
    poolID,
    poolName,
    port,
    host
} = require("../config/config.json");

connections = 0;

if (use_ngrok) {
    ngrok = spawn(`./ngrok`, [`tcp`, `-region`, `eu`, `${port}`]);

    ngrok.stderr.on("data", data => {
        console.log(`${poolName}: ${new Date().toLocaleString()}` + error(` Ngrok stderr: ${data}`));
        process.exit(-1);
    });

    ngrok.on('error', (err) => {
        console.log(`${poolName}: ${new Date().toLocaleString()}` + error(` Ngrok error: ${err}`));
        process.exit(-1);
    });

    ngrok.on("close", code => {
        console.log(`${poolName}: ${new Date().toLocaleString()}` + error(` Ngrok exited (code ${code})`));
        process.exit(-1);
    });
}

sync.login();
sync.updatePoolReward();
// require("./dashboard");

const server = net.createServer(handle);
server.listen(port, host, 0, () => {
    console.log(`${poolName}: ${new Date().toLocaleString()}` + info(` Server listening on port ${port}\n`));
})

server.maxConnections = 20000;
server.setNoDelay = true;

process.once("SIGINT", async() => { // catch SIGINT
    console.log(`${poolName}: ${new Date().toLocaleString()}` + warning(` SIGINT detected, closing the server and logging out the pool...`));
    await sync.logout(); // log out the pool from the server, so it doesn't appear online
    server.close();
    process.exit(0);
})

process.once("SIGTERM", async() => { // catch SIGTERM
    console.log(`${poolName}: ${new Date().toLocaleString()}` + warning(` SIGTERM detected, closing the server and logging out the pool...`));
    await sync.logout(); // log out the pool from the server, so it doesn't appear online
    server.close();
    process.exit(0);
})

setInterval(() => {
    server.getConnections((error, count) => {
        if (!error) {
            connections = count;
            console.log(`${poolName}: ${new Date().toLocaleString()}` + info(` Connected clients: ${count}`));
        }
    });
}, 10000);
