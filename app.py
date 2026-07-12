from flask import Flask, render_template, request, jsonify
import serial
import serial.tools.list_ports
import time

app = Flask(__name__)

ports = [p.device for p in serial.tools.list_ports.comports()]
target_port = 'COM8'
if target_port not in ports and ports:
    target_port = ports[0]

arduino = None
simulation_mode = True

try:
    arduino = serial.Serial(target_port, 9600, timeout=1)
    time.sleep(2)      # Wait for Arduino to reset
    simulation_mode = False
    print(f"Connected to Arduino on {target_port}")
except Exception as e:
    print(f"Error opening port {target_port}: {e}")
    print("Running in Simulation Mode...")

# Servo state variables
servo1 = 0
servo2 = 0
servo3 = 0
max_limit = 120

# ── Helper: safe serial write ──────────────────────────────
def safe_serial_write(data):
    """Write to Arduino, flushing stale ACK data first."""
    if not simulation_mode and arduino:
        try:
            arduino.reset_input_buffer()   # discard old ACKs
            arduino.write(data.encode())
        except Exception as e:
            print(f"Serial write error: {e}")
    else:
        print(f"[Simulated serial write] {data.strip()}")

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/status')
def status():
    return jsonify({
        "connected": not simulation_mode,
        "port": target_port if not simulation_mode else "None (Simulated)"
    })

@app.route('/update', methods=['POST'])
def update():
    global servo1, servo2, servo3, max_limit

    servo = request.form.get("servo")
    angle = int(request.form.get("angle"))
    limit = int(request.form.get("limit", max_limit))

    max_limit = limit

    if angle > max_limit:
        angle = max_limit

    if servo == "1":
        servo1 = angle
    elif servo == "2":
        servo2 = angle
    elif servo == "3":
        servo3 = angle

    send = f"{servo1},{servo2},{servo3},{max_limit}\n"
    safe_serial_write(send)

    return "OK"

@app.route('/reset', methods=['POST'])
def reset():
    global servo1, servo2, servo3

    servo1 = 0
    servo2 = 0
    servo3 = 0

    send = f"{servo1},{servo2},{servo3},{max_limit}\n"
    safe_serial_write(send)

    return "RESET"

@app.route('/stop', methods=['POST'])
def stop():
    """Emergency stop — reset ALL state and send clean STOP command."""
    global servo1, servo2, servo3

    servo1 = 0
    servo2 = 0
    servo3 = 0

    safe_serial_write("STOP\n")

    return "STOPPED"

if __name__ == "__main__":
    # use_reloader=False stops Flask from running twice and locking the COM port
    app.run(debug=True, use_reloader=False)