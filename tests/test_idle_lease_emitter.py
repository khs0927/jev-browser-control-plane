"""Offline tests for the opt-in idle lease emitter. No actual HTTP or secrets."""
import contextlib
import io
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import idle_lease_emitter as emitter


class Tests(unittest.TestCase):
    def test_request(self):
        req = emitter.prepare('start', 'fixture_1', 'run_123', 1,
                              'https://example.workers.dev', 'x'*40)
        self.assertEqual(req.full_url, 'https://example.workers.dev/v1/jobs/fixture_1/events')
        self.assertEqual(req.get_header('Authorization'), 'Bearer ' + 'x'*40)
        body = json.loads(req.data)
        self.assertEqual(body['seq'], 1)
        self.assertEqual(len(body['event_id']), 64)
        again = emitter.prepare('start', 'fixture_1', 'run_123', 1, 'https://example.workers.dev', 'x'*40)
        self.assertEqual(body['event_id'], json.loads(again.data)['event_id'])

    def test_invalid_url_rejected(self):
        for url in ('http://localhost', 'https://x/a', 'https://me:pw@x',
                    'https://x?key=123', ''):
            with self.subTest(url=url), self.assertRaises(ValueError):
                emitter.prepare('start', 'fixture', 'run_1', 1, url, 'x'*40)

    def test_invalid_event_sequence(self):
        for event, seq in (('start',2), ('heartbeat',1), ('finish',1)):
            with self.assertRaises(ValueError):
                emitter.prepare(event, 'fixture', 'run_1', seq, 'https://x', 'x'*40)

    def test_fail_closed_without_secret(self):
        with self.assertRaises(ValueError):
            emitter.prepare('start', 'fixture', 'run_1', 1, 'https://x', '')

    def test_success_does_not_log_token(self):
        class OK:
            status = 201
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, *args): return b'{"status":"RUNNING"}'
        output = io.StringIO()
        with patch.dict(os.environ, {'IDLE_LEASE_URL':'https://x',
                                     'IDLE_LEASE_TOKEN':'z'*40}), \
             patch.object(emitter.request, 'urlopen', return_value=OK()), \
             contextlib.redirect_stdout(output):
            rc = emitter.main(['start','--job-id','fixture','--run-id','run_1','--seq','1'])
        self.assertEqual(rc, 0)
        self.assertNotIn('z'*40, output.getvalue())


if __name__ == '__main__':
    unittest.main()
