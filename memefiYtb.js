import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function parseTasksFromFile(filePath) {
    try {
        const data = await fs.promises.readFile(filePath, 'utf8');

        const tasks = data.trim().split('\n').map(line => {
            const [taskid, task_name, code] = line.split('@');
            return { taskid, task_name, code };
        });

        return tasks;
    } catch (error) {
        console.error('Error reading file:', error);
        throw error;
    }
}

export default parseTasksFromFile;