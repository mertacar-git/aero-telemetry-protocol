import unittest
from protocol import Telemetry,encode,decode,crc16,StreamDecoder,SequenceTracker
class ProtocolTests(unittest.TestCase):
    def setUp(self): self.sample=Telemetry(42,1000,120,18,85)
    def test_crc_vector(self): self.assertEqual(crc16(b'123456789'),0x29b1)
    def test_roundtrip(self): self.assertEqual(decode(encode(self.sample)),self.sample)
    def test_corruption(self):
        packet=bytearray(encode(self.sample)); packet[10]^=1
        with self.assertRaises(ValueError): decode(packet)
    def test_every_fragment_size(self):
        packet=encode(self.sample)
        for size in range(1,len(packet)+1):
            parser=StreamDecoder(); results=[]
            for i in range(0,len(packet),size): results.extend(parser.feed(packet[i:i+size]))
            self.assertEqual(results,[self.sample])
    def test_resynchronization(self):
        packet=encode(self.sample); bad=bytearray(packet); bad[-1]^=1
        parser=StreamDecoder(); self.assertEqual(parser.feed(b'junk'+bytes(bad)+packet),[self.sample])
        self.assertEqual(parser.rejected,1)
    def test_unknown_length(self):
        parser=StreamDecoder(); packet=encode(self.sample)
        self.assertEqual(parser.feed(b'AT\xff\xff'+packet),[self.sample])
    def test_sequence_wrap(self):
        tracker=SequenceTracker(); tracker.observe(0xffffffff)
        self.assertEqual(tracker.observe(0),'in_order')
    def test_sequence_diagnostics(self):
        tracker=SequenceTracker()
        for sequence in [10,11,13,13,12,14]: tracker.observe(sequence)
        self.assertEqual((tracker.missing,tracker.duplicates,tracker.out_of_order),(1,1,1))
    def test_invalid_float(self):
        with self.assertRaises(ValueError): encode(Telemetry(0,0,float('nan'),1,1))
    def test_length(self): self.assertEqual(len(encode(self.sample)),32)
