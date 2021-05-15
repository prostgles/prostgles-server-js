#!/bin/bash
cd client
npm run build
cd ../server
npm run build

npm run test-server
sleep 5
npm run test-client &
cd ../client &&
npm test

