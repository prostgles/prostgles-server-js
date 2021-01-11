#!/bin/bash
cd server
npm run build &
cd ../client &&
sleep 20s && npm run build

