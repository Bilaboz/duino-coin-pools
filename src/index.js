/* Duino-Coin Pool
For documention about these functions see
https://github.com/revoxhere/duino-coin/blob/useful-tools
2019-2022 Duino-Coin community */

const net = require("net");
const handle = require("./connectionHandler");
const sync = require("./sync");
const { spawn } = require("child_process");
const log = require("./logging");
const { use_ngrok, port, host, autoRestart } = require("../config/config.json");

connections = 0;

if (use_ngrok) {
    ngrok = spawn(`./ngrok`, [`tcp`, `-region`, `eu`, `${port}`]);

    ngrok.stderr.on("data", (data) => {
        log.error(`Ngrok stderr: ${data}`);
        process.exit(-1);
    });

    ngrok.on("error", (err) => {
        log.error(`Ngrok error: ${err}`);
        process.exit(-1);
    });

    ngrok.on("close", (code) => {
        log.error(`Ngrok exited (code ${code})`);
        spawn(`sudo pkill ngrok`);
        process.exit(-1);
    });
}

sync.updatePoolReward();
sync.login();

require("./dashboard");

const server = net.createServer(handle);
server.listen(port, host, 0, () => {
    log.info(`Server listening on port ${port}\n`);
});

process.once("SIGINT", async () => {
    log.warning(
        "SIGINT detected, closing the server and logging out the pool..."
    );
    await sync.logout();
    server.close();
    process.exit(0);
});

process.once("SIGTERM", async () => {
    log.warning(
        "SIGTERM detected, closing the server and logging out the pool..."
    );
    await sync.logout();
    server.close();
    process.exit(0);
});

setInterval(() => {
    server.getConnections((error, count) => {
        if (!error) {
            connections = count;
            log.info(`Connected clients: ${count}`);
        }
    });
}, 10000);

if (autoRestart > 0) {
    log.info(`Autorestarter enabled (every ${autoRestart} minutes)`);
    setTimeout(function () {
        log.info(`Restarting`);
        if (use_ngrok) ngrok.kill();
        process.exit(1);
    }, autoRestart * 1000 * 60);
}
