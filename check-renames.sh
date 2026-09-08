#!/bin/sh
# Guard against fields renamed during this build-out. Any hit is a compile error
# waiting to happen. Add to this list whenever a field is renamed.
set -e
FAIL=0
for old in 'billed' 'totalBilled' 'walletRemaining' 'amountDue\.amount'; do
  HITS=$(grep -rn "\.${old}\b" --include='*.ts' --include='*.tsx' api src 2>/dev/null \
         | grep -v 'billedByAccount' | grep -v 'billed_amount_details' \
         | grep -v 'd\.billed\.' | grep -v 'billed\.rows' | grep -v 'billed\.apportioned' || true)
  if [ -n "$HITS" ]; then echo "STALE .$old:"; echo "$HITS" | sed 's/^/   /'; FAIL=1; fi
done
[ "$FAIL" = "0" ] && echo "no stale renamed-field references"
exit $FAIL
