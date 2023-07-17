#!/bin/bash
cd client
npm run build
cd ../server
rm -rf ./node-modules
npm i
npm run build

npm run test-server 2>&1 ./server.log
npm run test-client
