#!/bin/bash

# Install required software -> system
apt-get install -y nano vim glances wget curl git unzip net-tools iputils-ping iproute2

# Install required software -> NodeJS & NPM
curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
apt-get install -y nodejs

# Install NPM packages
cd /var/www/duino-coin-pools
npm install
npm install chalk@4
npm install form-data

# Install, copy and activate required software -> apache
apt-get install -y apache2
a2enmod rewrite
cp /var/www/duino-coin-pools/docker/ports.conf /etc/apache2/ports.conf
cp /var/www/duino-coin-pools/docker/000-default.conf /etc/apache2/sites-available/000-default.conf

# Restart apache service
service apache2 restart

# Start pool server + dashboard
#cd /var/www/duino-coin-pools/
#node src/dashboard.js

# Show apache logs
tail -f /var/log/apache2/error.log /var/log/apache2/access.log /dev/null
