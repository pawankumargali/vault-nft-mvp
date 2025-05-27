#!/usr/bin/env bash
set -uo pipefail            # strict-ish, but Bash-3 compatible

LOG_FILE="deployment.vault.log"
CONTRACTS_BASE_DIR="."
ENV="testnet"

###############################################################################
# generic helper – run command, log everything, preserve exit status
###############################################################################
log_cmd() {
  # usage: log_cmd COMMAND [ARG]...           (writes log, returns exit status)
  echo -e "\n----- $(printf '%q ' "$@") -----" >>"$LOG_FILE"
  "$@" 2>&1 | tee -a "$LOG_FILE"
  return "${PIPESTATUS[0]}"     # ← exit of first cmd in the pipeline
}

###############################################################################
# 0. fresh log
###############################################################################
: >"$LOG_FILE"
echo "INFO: Logging to $LOG_FILE"          | tee -a "$LOG_FILE"
echo "Run started: $(date -u +'%Y-%m-%dT%H:%M:%SZ')" | tee -a "$LOG_FILE"
echo "========================================================================" | tee -a "$LOG_FILE"

###############################################################################
# 1. switch network
###############################################################################
echo "INFO: Switching Sui environment to '$ENV'…" | tee -a "$LOG_FILE"
if ! log_cmd sui client switch --env "$ENV"; then
  echo "ERROR: could not switch to $ENV" | tee -a "$LOG_FILE"; exit 1
fi

###############################################################################
# 2. active address  (capture + log)
###############################################################################
ACTIVE_OUT=$(log_cmd sui client active-address)
if [[ $? -ne 0 ]]; then
  echo "ERROR: 'sui client active-address' failed" | tee -a "$LOG_FILE"; exit 1
fi
ACTIVE_ADDRESS=$(echo "$ACTIVE_OUT" | grep -oE '0x[0-9a-fA-F]{64}' | head -n1)
[[ -z "$ACTIVE_ADDRESS" ]] && { echo "ERROR: no address found" | tee -a "$LOG_FILE"; exit 1; }
echo "INFO: Active address: $ACTIVE_ADDRESS" | tee -a "$LOG_FILE"
echo "========================================================================" | tee -a "$LOG_FILE"

###############################################################################
# 3. gas check (we don't parse it – just make sure it succeeds & is logged)
###############################################################################
echo "INFO: Checking for gas…" | tee -a "$LOG_FILE"
if ! log_cmd sui client gas --json; then
  echo "ERROR: address appears unfunded" | tee -a "$LOG_FILE"; exit 1
fi
echo "INFO: Gas coins found – continuing." | tee -a "$LOG_FILE"
echo "========================================================================" | tee -a "$LOG_FILE"

###############################################################################
# 4. helper to publish one package  (always fully logged)
###############################################################################
publish_one () {
  local key=$1 dir=$2 kind=$3 status
  echo "INFO: Publishing $key ($kind) from $dir" | tee -a "$LOG_FILE"

  log_cmd sui client publish "$dir" --json
  status=$?
  [[ $status -eq 0 ]] \
      && echo "INFO: $key published successfully." \
      || echo "ERROR: $key failed to publish."      | tee -a "$LOG_FILE"
  return $status
}

###############################################################################
# 5. deploy list
###############################################################################
SUMMARY=""
ALL_OK=true

while IFS=';' read -r KEY SUBDIR KIND; do
  DIR="$CONTRACTS_BASE_DIR/$SUBDIR"
  if publish_one "$KEY" "$DIR" "$KIND"; then
    SUMMARY+="  • $(printf '%-15s' "$KEY")  SUCCESS\n"
  else
    SUMMARY+="  • $(printf '%-15s' "$KEY")  FAILURE\n"
    ALL_OK=false
  fi
done <<'EOF'
PORTFOLIO_VAULT;portfolio_vault;vault
EOF

###############################################################################
# 6. summary + exit code
###############################################################################
echo -e "\n========================================================================" | tee -a "$LOG_FILE"
echo -e "Deployment summary:\n$SUMMARY"          | tee -a "$LOG_FILE"

$ALL_OK && echo "✅  All contracts published." | tee -a "$LOG_FILE" \
         || { echo "❌  One or more publishes failed." | tee -a "$LOG_FILE"; exit 1; }
