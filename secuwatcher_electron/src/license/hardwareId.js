import { machineIdSync } from 'node-machine-id';
import crypto from 'crypto';

export async function generateHardwareId() {
  try {
    // 1. CPU ID (node-machine-id 사용 - 가장 안정적)
    const cpuId = machineIdSync();
    
    const hardwareId = crypto
      .createHash('sha256')
      .update(cpuId)
      .digest('hex');
    return hardwareId;
    
  } catch (error) {
    console.error('하드웨어 ID 생성 실패:', error);
    throw new Error(`하드웨어 ID 생성 실패: ${error.message}`);
  }
}