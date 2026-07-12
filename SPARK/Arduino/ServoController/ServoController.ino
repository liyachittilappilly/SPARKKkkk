/*
 * ============================================================
 *  Robotic Hand Rehabilitation — Servo Controller
 *  Protocol (line-delimited, newline-terminated):
 *    Normal : "s1,s2,s3,limit\n"    e.g. "90,45,0,120\n"
 *    Stop   : "STOP\n"
 *  Response: "ACK:s1,s2,s3,limit\n"  or  "ACK:STOPPED\n"
 * ============================================================
 */

#include <Servo.h>

// ── Pin Definitions ──────────────────────────────────────────
const int SERVO1_PIN  = 9;
const int SERVO2_PIN  = 10;
const int SERVO3_PIN  = 11;
const int LED_PIN     = 2;
const int SPEAKER_PIN = 8;

// ── Safety Limit ─────────────────────────────────────────────
int maxAngle = 120;

// ── Serial Reception Buffer (non-blocking, no String class) ─
const int BUF_SIZE = 64;
char recvBuf[BUF_SIZE];
int  bufPos = 0;

// ── Current Servo Positions (internal tracking) ─────────────
int curS1 = 0;
int curS2 = 0;
int curS3 = 0;

// ── Servo Objects ────────────────────────────────────────────
Servo servo1;
Servo servo2;
Servo servo3;

// =============================================================
//  Audio Helpers
// =============================================================
void beep(int freq, int durMs)
{
    tone(SPEAKER_PIN, freq, durMs);
    delay(durMs);
    noTone(SPEAKER_PIN);
}

void beepThreeTimes()
{
    for (int i = 0; i < 3; i++)
    {
        beep(1000, 200);
        delay(200);
    }
}

// =============================================================
//  Emergency Stop — all servos to 0 immediately
// =============================================================
void emergencyStop()
{
    digitalWrite(LED_PIN, LOW);
    tone(SPEAKER_PIN, 500, 500);   // non-blocking alert

    servo1.write(0);
    servo2.write(0);
    servo3.write(0);

    curS1 = 0;
    curS2 = 0;
    curS3 = 0;

    Serial.println("ACK:STOPPED");
}

// =============================================================
//  Process one complete command line
// =============================================================
void processCommand(char *cmd)
{
    // Ignore empty lines
    if (cmd[0] == '\0')
        return;

    // ── Emergency Stop ──
    if (strstr(cmd, "STOP") != NULL)
    {
        emergencyStop();
        return;
    }

    // ── Normal command: "s1,s2,s3[,limit]" ──
    int s1 = 0, s2 = 0, s3 = 0;
    int limitVal = maxAngle;          // safe default if not provided

    int parsed = sscanf(cmd, "%d,%d,%d,%d",
                        &s1, &s2, &s3, &limitVal);

    if (parsed < 3)                   // not enough data — ignore
        return;

    digitalWrite(LED_PIN, HIGH);

    // Update safety limit only if a valid value was provided
    if (parsed == 4 && limitVal >= 30 && limitVal <= 180)
        maxAngle = limitVal;

    // Clamp every servo to the safe range
    s1 = constrain(s1, 0, maxAngle);
    s2 = constrain(s2, 0, maxAngle);
    s3 = constrain(s3, 0, maxAngle);

    // Drive the servos
    servo1.write(s1);
    servo2.write(s2);
    servo3.write(s3);

    // Track internal state
    curS1 = s1;
    curS2 = s2;
    curS3 = s3;

    // Acknowledge back to Python
    Serial.print("ACK:");
    Serial.print(s1); Serial.print(',');
    Serial.print(s2); Serial.print(',');
    Serial.print(s3); Serial.print(',');
    Serial.println(maxAngle);
}

// =============================================================
//  Setup
// =============================================================
void setup()
{
    Serial.begin(9600);

    servo1.attach(SERVO1_PIN);
    servo2.attach(SERVO2_PIN);
    servo3.attach(SERVO3_PIN);

    pinMode(LED_PIN, OUTPUT);
    pinMode(SPEAKER_PIN, OUTPUT);

    digitalWrite(LED_PIN, HIGH);      // LED ON = ready/normal

    servo1.write(0);
    servo2.write(0);
    servo3.write(0);

    delay(500);
    beepThreeTimes();

    Serial.println("READY");
}

// =============================================================
//  Main Loop — Non-blocking Serial Reader
// =============================================================
void loop()
{
    // ── Overflow guard ──
    // If the hardware UART buffer is nearly full it means the PC
    // is sending faster than we can process.  Flush everything up
    // to the most recent newline so we always act on the newest
    // command rather than processing a backlog of stale angles.
    if (Serial.available() > 60)
    {
        while (Serial.available() > 0)
        {
            if (Serial.read() == '\n')
                break;
        }
        bufPos = 0;
        return;                        // re-enter loop() immediately
    }

    // ── Read whatever bytes are available right now ──
    while (Serial.available() > 0)
    {
        char c = Serial.read();

        if (c == '\n')                 // end of a command
        {
            recvBuf[bufPos] = '\0';    // null-terminate
            processCommand(recvBuf);
            bufPos = 0;                // reset for next command
        }
        else if (c != '\r')            // ignore CR (handles \r\n)
        {
            if (bufPos < BUF_SIZE - 1)
            {
                recvBuf[bufPos] = c;
                bufPos++;
            }
            else
            {
                // Line too long — discard and start fresh
                bufPos = 0;
            }
        }
    }
}