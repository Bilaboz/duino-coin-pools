const chalk = require('chalk');
const info = chalk.blue;
const error = chalk.bold.red;
const success = chalk.green;
const warning = chalk.hex('#FFA500');

const { poolName } = require("../config/config.json");

const info = (msg) => {
	console.log(`${poolName}: ${new Date().toLocaleString()} ` + info(msg));
}

const success = (msg) => {
	console.log(`${poolName}: ${new Date().toLocaleString()} ` + success(msg));
}

const warning = (msg) => {
	console.log(`${poolName}: ${new Date().toLocaleString()} ` + warning(msg));
}

const error = (msg) => {
	console.log(`${poolName}: ${new Date().toLocaleString()} ` + error(msg));
}

module.exports = {
	info,
	success,
	warning,
	error
}