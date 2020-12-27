#!/bin/bash
cd server
npm run build &
cd ../client &&
npm run build

