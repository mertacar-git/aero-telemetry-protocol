import unittest
from streamlit.testing.v1 import AppTest
class AppTests(unittest.TestCase):
    def test_decoder_error(self):
        app=AppTest.from_file('app.py').run(timeout=30)
        self.assertFalse(app.exception)
        app.text_area[0].set_value('00').run(timeout=30)
        self.assertTrue(app.error); self.assertFalse(app.exception)
