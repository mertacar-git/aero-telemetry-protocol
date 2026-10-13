import subprocess,sys
from protocol import Telemetry,encode
result=subprocess.run([sys.argv[1]],capture_output=True,text=True,check=True).stdout.strip()
expected=encode(Telemetry(42,1000,120,18,85)).hex()
assert result==expected,(result,expected)
print('C++/Python wire compatibility passed:',expected)
