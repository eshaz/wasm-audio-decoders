#!/bin/bash

find ./src -maxdepth 1 -type d -exec sh -c 'cd {}; npm i &' \;
