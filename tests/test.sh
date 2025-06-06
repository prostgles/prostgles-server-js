#!/bin/bash

set -e # Exit immediately if a command exits with a non-zero status

npm run build
npm run test-server-funcs

cd client
npm run build
npm run testBasicHooks


cd ../server

if [ $# -eq 0 ]; then
  # no args passed
  rm -rf ./node-modules
  npm i
fi

npm run build
npm run test-server && \
TEST_NAME="main"         npm run test-client && \
TEST_NAME="useProstgles" npm run test-client && \
TEST_NAME="files"        npm run test-client && \
TEST_NAME="rest_api"     npm run test-client

