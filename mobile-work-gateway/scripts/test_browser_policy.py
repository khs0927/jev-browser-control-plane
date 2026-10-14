"""Offline tests for browser egress policy. No real browser or network required."""
import importlib.util
from pathlib import Path
from unittest import TestCase, main
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("mwg_task", Path(__file__).with_name("run_task.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

PUBLIC_DNS = [
    (2, 1, 6, "", ("93.184.215.14", 443)),
    (10, 1, 6, "", ("2606:4700::1111", 443)),
]
PRIVATE_DNS = [(2, 1, 6, "", ("169.254.169.254", 443))]


class BrowserPolicyTests(TestCase):
    def setUp(self):
        module._public_dns.cache_clear()

    def test_public_https_allowed(self):
        with patch.object(module.socket, "getaddrinfo", return_value=PUBLIC_DNS):
            self.assertTrue(module.safe_browser_url("https://example.com/document?x=1", "example.com"))

    def test_dns_private_address_denied(self):
        with patch.object(module.socket, "getaddrinfo", return_value=PRIVATE_DNS):
            self.assertFalse(module.safe_browser_url("https://example.com/", "example.com"))

    def test_dns_mixed_address_denied(self):
        with patch.object(module.socket, "getaddrinfo", return_value=PUBLIC_DNS + PRIVATE_DNS):
            self.assertFalse(module.safe_browser_url("https://example.com/", "example.com"))

    def test_public_host_redirects_must_stay_on_host(self):
        with patch.object(module.socket, "getaddrinfo", return_value=PUBLIC_DNS):
            self.assertFalse(module.safe_browser_url("https://other.example.net/", "example.com"))
            self.assertFalse(module.safe_browser_url("http://example.com/", "example.com"))
            self.assertFalse(module.safe_browser_url("https://example.com:444/", "example.com"))
            self.assertFalse(module.safe_browser_url("https://user:pass@example.com/", "example.com"))

    def test_ip_literals_and_special_names_denied(self):
        for url in (
            "https://127.0.0.1/",
            "https://[::1]/",
            "https://169.254.169.254/",
            "https://localhost/",
            "https://localhost./",
            "https://private.internal/",
            "https://service.local/",
            "https://example.com:443@localhost/",
        ):
            with self.subTest(url=url):
                self.assertFalse(module.safe_browser_url(url, "example.com"))

    def test_dns_lookup_failure_closed(self):
        with patch.object(module.socket, "getaddrinfo", side_effect=OSError("failed")):
            self.assertFalse(module.safe_browser_url("https://example.com/", "example.com"))


if __name__ == "__main__":
    main()
