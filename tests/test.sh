#!/bin/bash
cd client
npm run build
cd ../server

if [ $# -eq 0 ]; then
  # no args passed
  rm -rf ./node-modules
  npm i
fi

npm run build

#npm run test-server 2>&1 ./server.log
npm run test-server && \
TEST_NAME="main"        npm run test-client && \
TEST_NAME="files"       npm run test-client && \
TEST_NAME="rest_api"    npm run test-client

