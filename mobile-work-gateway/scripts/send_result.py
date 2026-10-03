"""Send bounded public fixture results with GitHub Actions OIDC; never log tokens."""
import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

endpoint = os.environ.get('MWG_RESULT_ENDPOINT', '')
if not endpoint:
    raise SystemExit('MWG_RESULT_ENDPOINT is required for callback delivery')
url = urllib.parse.urlparse(endpoint)
if url.scheme != 'https' or url.path != '/internal/results' or url.username or url.password or url.query or url.fragment:
    raise SystemExit('Invalid result endpoint')
request_id = os.environ['MWG_REQUEST_ID']
result = json.loads(Path('mobile-work-results/result.json').read_text())
body = json.dumps({'request_id': request_id, 'result': result}).encode()
if len(body) > 16384:
    raise SystemExit('Result exceeds callback limit')
request_url = os.environ['ACTIONS_ID_TOKEN_REQUEST_URL'] + '&audience=' + urllib.parse.quote(endpoint, safe='')
request = urllib.request.Request(request_url, headers={'Authorization': 'Bearer ' + os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']})
with urllib.request.urlopen(request, timeout=15) as response:
    token = json.load(response)['value']
for attempt in range(3):
    try:
        req = urllib.request.Request(endpoint, data=body, headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=15) as response:
            if not json.load(response).get('accepted'):
                raise RuntimeError('Callback not accepted')
        break
    except Exception:
        if attempt == 2:
            raise SystemExit('Result callback delivery failed; inspect gateway and run metadata')
        time.sleep(attempt + 1)
