import tempfile
from pathlib import Path
import unittest
from runtime_health import browser_state


class BrowserHealthTests(unittest.TestCase):
    def state(self, commands):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for pid, args in enumerate(commands, 1):
                (root / str(pid)).mkdir()
                (root / str(pid) / 'cmdline').write_bytes(('\0'.join(args) + '\0').encode())
            return browser_state(root)

    def test_no_browser_is_not_ready(self):
        self.assertEqual(self.state([]), (False, False))

    def test_expected_browser_process(self):
        self.assertEqual(self.state([['/usr/lib/chromium/chromium',
                         '--user-data-dir=/home/runner/browser-profile']]), (True, True))

    def test_renderer_and_other_profiles_do_not_count(self):
        self.assertEqual(self.state([
            ['chromium', '--user-data-dir=/home/runner/browser-profile', '--type=renderer'],
            ['chromium', '--user-data-dir=/other']]), (False, False))

    def test_disabling_sandbox_fails_closed(self):
        for flag in ['--no-sandbox', '--disable-setuid-sandbox',
                     '--disable-namespace-sandbox', '--disable-seccomp-filter-sandbox']:
            with self.subTest(flag=flag):
                self.assertEqual(self.state([['chromium',
                    '--user-data-dir=/home/runner/browser-profile', flag]]), (True, False))

    def test_unsafe_duplicate_cannot_hide_behind_healthy_process(self):
        args = ['chromium', '--user-data-dir=/home/runner/browser-profile']
        self.assertEqual(self.state([args, args + ['--no-sandbox']]), (True, False))


if __name__ == '__main__':
    unittest.main()
