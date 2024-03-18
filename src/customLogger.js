import fs, { promises as fsp } from 'fs';
import { join, dirname } from 'path';
import { scheduleJob } from 'node-schedule';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Utility function for parsing environment variables
function getEnvVar(name, fallback, type = 'string') {
    const value = process.env[name];
    if (value == null) return fallback;
    switch (type) {
        case 'boolean':
            return value === 'true';
        case 'number':
            return parseInt(value, 10);
        default:
            return value;
    }
}

export class CustomLogger {
    constructor(options = {}) {
        // Define default options, including a new option 'splitLogs'
        const defaultOptions = {
            verboseLogging: true,
            verboseReporting: true,
            errorReporting: true,
            logLevel: 'info',
            deleteAfterDays: null,
            logDirectory: join(__dirname, '../logs'),
            errorLogDirectory: join(__dirname, '../logs/errors'),
            splitLogs: true,
            logFormatter: (level, message, context) => `${new Date().toISOString()} [${level.toUpperCase()}] - ${message} ${JSON.stringify(context)}`,
        };

        // Check if environment variables should overrule
        const envOverrule = process.env.customLogger_envOverrule === 'true';

        // Parse environment variables for options
        const envVarsOptions = this.parseEnvVars();

        // Merge options with priority: env vars > explicit options > defaults if envOverrule is true
        // Otherwise, follow the priority: explicit options > env vars > defaults
        this.options = envOverrule
            ? { ...defaultOptions, ...options, ...envVarsOptions }
            : { ...defaultOptions, ...envVarsOptions, ...options };

        // Ensure log directories are created
        this.ensureDirectories().then(() => {
            // Set up log file rotation based on 'deleteAfterDays' option
            if (this.options.deleteAfterDays) {
                scheduleJob('0 0 * * *', () => this.deleteOldFiles());
            }
        });

        // Initialize stream and date tracking for log rotation
        this.writeStreams = {};
        this.currentLogDate = {};

        // Setup global error handling for the process
        this.setupErrorHandling();
    }

    async ensureDirectories() {
        // Create the log and error log directories if they don't already exist
        await Promise.all([
            fsp.mkdir(this.options.logDirectory, { recursive: true }),
            fsp.mkdir(this.options.errorLogDirectory, { recursive: true })
        ]);
    }

    async deleteOldFiles() {
        // Delete log files older than 'deleteAfterDays' in both log and error log directories
        const directories = [this.options.logDirectory, this.options.errorLogDirectory];
        for (const dir of directories) {
            const files = await fsp.readdir(dir);
            const currentDate = new Date();
            for (const file of files) {
                const filePath = join(dir, file);
                const fileStat = await fsp.stat(filePath);
                const fileAgeDays = (currentDate - fileStat.birthtime) / (1000 * 60 * 60 * 24);
                if (fileAgeDays > this.options.deleteAfterDays) {
                    await fsp.unlink(filePath);
                }
            }
        }
    }

    getLogFileName(type = 'report') {
        // Generate the log file name based on the current date and log type
        const date = new Date();
        const dateString = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;

        // When not splitting logs, use a common log file for all log types except errors
        const fileName = this.options.splitLogs || type === 'error'
            ? `${dateString}-${type}.log`
            : `${dateString}-all.log`;

        const directory = type === 'error' ? this.options.errorLogDirectory : this.options.logDirectory;
        return join(directory, fileName);
    }

    async rotateLogStream(type) {
        // Close the current stream for a log type and remove its reference, allowing a new one to be created
        if (this.writeStreams[type]) {
            await new Promise((resolve) => this.writeStreams[type].end(resolve));
            delete this.writeStreams[type];
        }
    }

    // Log a message to file
    async logToFile(message, type) {

        // Check if logging is enabled for this type
        if (!message) {
            this.logToCriticalFile(`logToFile called with UNKNOWN MESSAGE: ${message} with type: ${type}`);
            return;
        }

        if (!type) {
            this.logToCriticalFile(`logToFile called with message: ${message} and UKNOWN TYPE: ${type}`);
            return;
        }

        const logLevels = { 'debug': 1, 'log': 2, 'info': 3, 'warn': 4, 'error': 5 };

        // Determine if the log type meets the current log level setting
        const isLogTypeEnabled = logLevels[type] >= logLevels[this.options.logLevel];
        // Error reporting condition
        const isErrorReportingEnabled = logLevels[type] === 'error' && this.options.errorReporting;
        // Log reporting condition
        const isLogReportingEnabled = logLevels[type] !== 'error' && this.options.verboseReporting;

        // Check if logging is enabled for this type
        if (!isLogTypeEnabled || !(isErrorReportingEnabled || isLogReportingEnabled)) {
            return;
        }

        try {
            const fileName = this.getLogFileName(type);
            if (!this.writeStreams[fileName]) {
                this.writeStreams[fileName] = fs.createWriteStream(fileName, { flags: 'a' });
            }

            const logPrefix = this.options.splitLogs ? '' : `[${type.toUpperCase()}] `;
            const logMessage = `${logPrefix}${message}\n`;

            this.writeStreams[fileName].write(logMessage);
        } catch (error) {
            const errorMessage = `Internal logger error: ${error.message}`;
            this.logToCriticalFile(errorMessage).catch((err) => {
                console.error("Critical logger failure:", err);
            });
        }
    }

    loggerReporterHelper(level, message, context = {}) {
        // Format and log messages, using 'verboseLogging' to control console output
        const formattedMessage = this.options.logFormatter(level, message, context);
        if (this.options.verboseLogging) {
            console.log(formattedMessage);
        }
        this.logToFile(formattedMessage, level);
    }

    // Logging methods for different levels
    log(message, context) { this.loggerReporterHelper('log', message, context); }
    debug(message, context) { this.loggerReporterHelper('debug', message, context); }
    info(message, context) { this.loggerReporterHelper('info', message, context); }
    warn(message, context) { this.loggerReporterHelper('warn', message, context); }
    error(message, context) { this.loggerReporterHelper('error', message, context); }

    wrapFunction(fn, { name = fn.name, ignoreErrors = false } = {}) {
        // Wrap a function to log its execution time and handle errors
        return async (...args) => {
            const start = Date.now();
            try {
                let result;

                result = await fn(...args);
                const duration = Date.now() - start;
                this.log(`Function ${name} completed in ${duration}ms`, { duration, name, status: 'success' });
                return result;
            } catch (error) {
                // Log the error regardless of ignoreErrors option
                this.error(`Error in function ${name}: ${error}`, { name, status: 'error', error: error.message });

                // Only re-throw the error if ignoreErrors is explicitly set to false
                if (!ignoreErrors) {
                    throw error;
                }
            }
        };
    }

    parseEnvVars() {
        // Parse environment variables to configure logger options
        return {
            ...(process.env.customLogger_verboseLogging !== undefined && { verboseLogging: getEnvVar('customLogger_verboseLogging', undefined, 'boolean') }),
            ...(process.env.customLogger_verboseReporting !== undefined && { verboseReporting: getEnvVar('customLogger_verboseReporting', undefined, 'boolean') }),
            ...(process.env.customLogger_errorReporting !== undefined && { errorReporting: getEnvVar('customLogger_errorReporting', undefined, 'boolean') }),
            ...(process.env.customLogger_logLevel !== undefined && { logLevel: getEnvVar('customLogger_logLevel', undefined) }),
            ...(process.env.customLogger_deleteAfterDays !== undefined && { deleteAfterDays: getEnvVar('customLogger_deleteAfterDays', undefined, 'number') }),
            ...(process.env.customLogger_logDirectory !== undefined && { logDirectory: getEnvVar('customLogger_logDirectory', undefined) }),
            ...(process.env.customLogger_errorLogDirectory !== undefined && { errorLogDirectory: getEnvVar('customLogger_errorLogDirectory', undefined) }),
            ...(process.env.customLogger_splitLogs !== undefined && { splitLogs: getEnvVar('customLogger_splitLogs', undefined, 'boolean') }),
        };
    }

    closeAllStreams() {
        // Gracefully close all active write streams
        return Promise.all(
            Object.keys(this.writeStreams).map((type) =>
                new Promise((resolve) => {
                    this.writeStreams[type].end(() => {
                        delete this.writeStreams[type];
                        resolve();
                    });
                })
            )
        );
    }

    setupErrorHandling() {
        // Global error handling setup for the process
        process.on('exit', () => {
            this.closeAllStreams().catch((err) => {
                this.logToCriticalFile(`Error on exit: ${err.message}`).catch(console.error);
            });
        });

        process.on('SIGINT', () => {
            this.closeAllStreams().catch((err) => {
                this.logToCriticalFile(`SIGINT error: ${err.message}`).catch(console.error);
            }).finally(() => process.exit(0));
        });

        process.on('SIGTERM', () => {
            this.closeAllStreams().catch((err) => {
                this.logToCriticalFile(`SIGTERM error: ${err.message}`).catch(console.error);
            }).finally(() => process.exit(0));
        });

        process.on('uncaughtException', (err) => {
            this.logToCriticalFile(` ${new Date().toISOString()} - Uncaught Exception: ${err.message}\nStack: ${err.stack}`).catch((logErr) => {
            }).finally(() => {
                console.log(err);
                this.closeAllStreams().then(() => process.exit(1));
            });
        });
    }

    async logToCriticalFile(message) {
        // Safeguard for logging critical internal errors
        const criticalLogFileName = join("./_internalError.log");
        try {
            console.error("customLogger faced a critical or internal error. Output written to _internalError.log");
            await fsp.appendFile(criticalLogFileName, message + "\n");
        } catch (error) {
            console.error("Mayor logging failure. Resolve this error immediately:", error);
            //consider throwing this to an external issue listener
        }
    }
}
