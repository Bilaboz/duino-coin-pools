/* Duino-Coin Pool logging system
For documention about these functions see
https://github.com/revoxhere/duino-coin/blob/useful-tools
2019-2022 Duino-Coin community */

const chalk = require("chalk");
const blue = chalk.blue;
const red = chalk.bold.red;
const green = chalk.green;
const orange = chalk.hex("#FFA500");

const { poolName } = require("../config/config.json");

const info = (msg) => {
	console.log(`${poolName}: ${new Date().toLocaleString()} ` + blue(msg));
};

const success = (msg) => {
	console.log(`${poolName}: ${new Date().toLocaleString()} ` + green(msg));
};

const warning = (msg) => {
	console.log(`${poolName}: ${new Date().toLocaleString()} ` + orange(msg));
};

const error = (msg) => {
	console.log(`${poolName}: ${new Date().toLocaleString()} ` + red(msg));
};

module.exports = {
	info,
	success,
	warning,
	error,
};
