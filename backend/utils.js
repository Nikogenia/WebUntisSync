export function formatToLocalISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function formatToLocalISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

export function formatToLocalISOTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${hours}:${minutes}:${seconds}`;
}

export function TaskQueue(concurrency) {

    let running = 0;
    let resolveEmpty = null;
    const tasks = [];

    const queue = async (task) => {
        tasks.push(task);
        if (running >= concurrency) return;

        ++running;
        while (tasks.length) {
            try {
                await tasks.shift()();
            } catch(err) {
                console.error("Error while executing task in queue:", err);
            }
        }
        --running;

        if (running === 0 && tasks.length === 0 && resolveEmpty) {
            resolveEmpty();
            resolveEmpty = null;
        }
    }

    queue.waitUntilEmpty = () => {
        if (running === 0 && tasks.length === 0) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            resolveEmpty = resolve;
        });
    };

    return queue;

}
