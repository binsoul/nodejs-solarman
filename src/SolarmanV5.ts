/**
 * Implements the Solarman v5 protocol.
 */
export class SolarmanV5 {
    private readonly frameStart: Buffer;
    private readonly frameControlCode: Buffer;
    private readonly frameSerialNumber: Buffer;
    private readonly frameType: Buffer;
    private readonly frameSensorType: Buffer;
    private readonly frameDeliveryTime: Buffer;
    private readonly framePowerOnTime: Buffer;
    private readonly frameOffsetTime: Buffer;
    private readonly frameChecksum: Buffer;
    private readonly frameEnd: Buffer;

    private readonly ignoreProtocolErrors: boolean;
    private sequenceNumber = 1;

    /**
     *
     * @param {string} serialNumber Serial number of the target device.
     * @param {boolean} ignoreProtocolErrors Ignore some protocol errors.
     */
    constructor(serialNumber: string, ignoreProtocolErrors = false) {
        this.ignoreProtocolErrors = ignoreProtocolErrors;

        this.frameStart = Buffer.from('A5', 'hex');
        this.frameControlCode = Buffer.from('1045', 'hex');
        this.frameType = Buffer.from('02', 'hex');
        this.frameSensorType = Buffer.from('0000', 'hex');
        this.frameDeliveryTime = Buffer.from('00000000', 'hex');
        this.framePowerOnTime = Buffer.from('00000000', 'hex');
        this.frameOffsetTime = Buffer.from('00000000', 'hex');
        this.frameChecksum = Buffer.from('00', 'hex');
        this.frameEnd = Buffer.from('15', 'hex');

        this.frameSerialNumber = Buffer.alloc(4);
        this.frameSerialNumber.writeUInt32LE(Number(serialNumber), 0);
    }

    /**
     * Embeds the given Modbus RTU frame into a Solarman v5 frame.
     */
    public wrapModbusFrame(modbusFrame: Buffer): Buffer {
        const sequenceNumber = Buffer.alloc(2);
        sequenceNumber.writeUInt16LE(this.getNextSequenceNumber(), 0);

        const dataLength = Buffer.alloc(2);
        dataLength.writeUInt16LE(15 + modbusFrame.length, 0);

        const header = Buffer.concat([this.frameStart, dataLength, this.frameControlCode, sequenceNumber, this.frameSerialNumber]);
        const payload = Buffer.concat([this.frameType, this.frameSensorType, this.frameDeliveryTime, this.framePowerOnTime, this.frameOffsetTime, modbusFrame]);
        const footer = Buffer.concat([this.frameChecksum, this.frameEnd]);

        const frame = Buffer.concat([header, payload, footer]);

        frame[frame.length - 2] = this.calculateFrameChecksum(frame);

        return frame;
    }

    /**
     * Returns the Modbus RTU frame embedded into the given Solarman v5 frame.
     */
    public unwrapModbusFrame(solarmanFrame: Buffer): Buffer {
        let frameLength = solarmanFrame.length;
        const payloadLength = solarmanFrame.readUInt16LE(1);

        const headerLength = 13;

        if (frameLength !== headerLength + payloadLength) {
            if (!this.ignoreProtocolErrors) {
                throw new Error('Frame length does not match payload length.');
            }

            frameLength = headerLength + payloadLength;
        }

        if (solarmanFrame[0] !== this.frameStart.readUInt8() || solarmanFrame[frameLength - 1] !== this.frameEnd.readUInt8()) {
            throw new Error('Frame contains invalid start or end values.');
        }

        if (solarmanFrame[frameLength - 2] !== this.calculateFrameChecksum(solarmanFrame)) {
            throw new Error('Frame contains invalid V5 checksum.');
        }

        if (solarmanFrame[5] !== this.sequenceNumber) {
            if (!this.ignoreProtocolErrors) {
                throw new Error('Frame contains invalid sequence number.');
            }
        }

        if (solarmanFrame.subarray(7, 11).toString() !== this.frameSerialNumber.toString()) {
            throw new Error('Frame contains incorrect data logger serial number.');
        }

        if (solarmanFrame.readUint16LE(3) !== 0x1510) {
            throw new Error('Frame contains incorrect control code.');
        }

        if (solarmanFrame[11] !== 0x02) {
            throw new Error('Frame contains invalid frame type.');
        }

        const modbusFrame = solarmanFrame.subarray(25, frameLength - 2);

        if (modbusFrame.length < 5) {
            throw new Error('Frame does not contain a valid Modbus RTU frame.');
        }

        return modbusFrame;
    }

    /**
     * Calculates the checksum of a buffer.
     */
    private calculateFrameChecksum(buffer: Buffer) {
        let checksum = 0;
        for (let i = 1; i < buffer.length - 2; i++) {
            checksum += buffer[i] & 0xff;
        }

        return Number(checksum & 0xff);
    }

    /**
     * Returns the next sequence number.
     */
    private getNextSequenceNumber() {
        this.sequenceNumber++;

        if (this.sequenceNumber > 255) {
            this.sequenceNumber = 1;
        }

        return this.sequenceNumber;
    }
}
