#!/bin/sh

shopt -s globstar

if [[ "$#" == 1 ]]; then
  list=($1)
else
  list=`echo $@`
fi
list=${list[*]}
entry=${list// /\",\"}

if [[ ! -z "${output}" ]]; then
  echo "save coverage to $output"
else
  output=coverage_filtered.json
fi

cat coverage.json | jq {\"${entry}\"} | jq -r tostring > $output
rm -rf coverage
istanbul report --include=$output
if [ -f coverage_filtered.json ]; then
  rm coverage_filtered.json
fi
mv coverage/lcov-report/* coverage/
rmdir coverage/lcov-report
