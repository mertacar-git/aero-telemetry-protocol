import json
from dataclasses import asdict
import pandas as pd
import streamlit as st
from protocol import Telemetry,encode,decode,StreamDecoder,SequenceTracker

st.set_page_config(page_title='Aero Telemetry Protocol',page_icon='📡',layout='wide')
st.title('Aero Telemetry Protocol')
st.caption('Binary packets · CRC-16/CCITT-FALSE · fragmented streams · sequence diagnostics')
sequence=st.sidebar.number_input('Sequence',0,4294967295,42)
altitude=st.sidebar.number_input('Altitude (m)',value=120.0)
speed=st.sidebar.number_input('Airspeed (m/s)',0.0,1000.0,18.0)
battery=st.sidebar.slider('Battery (%)',0.0,100.0,85.0)
fragment=st.sidebar.slider('Stream chunk size (bytes)',1,64,7)
sample=Telemetry(int(sequence),1000,float(altitude),float(speed),float(battery))
packet=encode(sample)
tabs=st.tabs(['Encode','Decode hex','Stream recovery'])
with tabs[0]:
    st.code(packet.hex(' '))
    st.json(asdict(decode(packet)))
    st.download_button('Download binary packet',packet,'telemetry.bin','application/octet-stream')
    st.caption('Demo timestamp is 1,000 ms; the protocol timestamp is a sender-defined monotonic clock, not UTC.')
with tabs[1]:
    text=st.text_area('Packet hex',packet.hex())
    try: st.json(asdict(decode(bytes.fromhex(text))))
    except ValueError as exc: st.error(str(exc))
with tabs[2]:
    corruption=st.checkbox('Insert corrupt packet and noise',True)
    samples=[Telemetry(i,1000+i*100,100+i,18,85) for i in [10,11,13,13,12,14]]
    encoded=[encode(s) for s in samples]
    if corruption:
        bad=bytearray(encoded[1]); bad[18]^=0x40
        stream=b'noise'+encoded[0]+bytes(bad)+b'garbage'+b''.join(encoded[1:])
    else: stream=b''.join(encoded)
    parser=StreamDecoder(); tracker=SequenceTracker(); rows=[]
    for i in range(0,len(stream),fragment):
        for value in parser.feed(stream[i:i+fragment]): rows.append(dict(**asdict(value),status=tracker.observe(value.sequence)))
    cols=st.columns(4)
    for col,label,value in zip(cols,['Decoded','Rejected candidates','Missing sequences','Duplicates'],[len(rows),parser.rejected,tracker.missing,tracker.duplicates]): col.metric(label,value)
    st.dataframe(pd.DataFrame(rows),width='stretch')
    st.write(f'Out-of-order packets: {tracker.out_of_order}; discarded bytes: {parser.discarded_bytes}; pending bytes: {len(parser.buffer)}')
    st.download_button('Download test stream',stream,'stream.bin','application/octet-stream')
st.info('CRC detects accidental corruption; it does not authenticate the sender or encrypt the data. The wire format is a demonstration protocol, not an aviation standard.')
