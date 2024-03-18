# Custom Logger for Node.js

A simple and lightweight logging solution for Node.js applications, offering custom console and file logging with daily log rotation, function execution monitoring, and more.


## Features

- Supports various logging levels: 'error', 'warn', 'info', and 'debug', as well as function 'log'
- Verbose logging to the console, toggleable via options or environment variables.
- File logging with separate directories for regular and error logs.
- Automatic file rotation and deletion based on days.
- Timing of function execution with success and error reporting.
- Ability to create logger instances with unique configurations.
- Extensible for additional functionalities, such as email notifications for critical errors.


## Installation

1. Clone the repository into your local project directory:

    `git clone https://github.com/sammyd3v/sd-customlogger.git ../yourproject/node_modules/sd-customlogger`

2. Navigate to the `customlogger` directory inside your project's `node_modules`:

    `cd path/to/your/project/node_modules/customlogger`

3. Install the package dependencies:

    `npm install`


## Usage

After installation, you can use the custom logger in your application, to wrap functions with name and error throwing options. You can also define your own logs.

- Import the logger:
   `import customLogger from 'customlogger';`


#### Wrapping examples

- Wrap a function for execution time and error logging:

    ```
    async function exampleFunction() {
      // Function logic...
    }
    const wrappedFunction = customLogger.wrapFunction(exampleFunction);
    wrappedFunction();
    ```

- Directly wrapping and invoking a function example:

    ```
    customLogger.wrapFunction(exampleFunction)();
    ```

- Wrapping a function with original arguments and options for the wrapper:

    ```
    customLogger.wrapFunction(exampleFunction, { name: "exampleFunction", ignoreErrors: true })("Hello", "World");
    ```
    
    `name: "CustomFunctionName"` gives a custom name, defaults to Function name.
    `ignoreErrors: true` will still log errors but not throw them, defaults to false.

Example output: `2024-03-18T12:22:08.540Z [LOG] - Function exampleFunction completed in 9ms {"duration":9,"name":"exampleFunction","status":"success"}`

- Creating your own logs with specified log levels. Default supported:

    ```
    customLogger.log("This is a test log message.");
    customLogger.debug("This is a debug message.");
    customLogger.info("This is a general info message.");
    customLogger.warn("This is a warning message.");
    customLogger.error("This is an error message.");
    ```

- Pass through your own custom parameters:

    ```
    customLogger.info("This is a status info message." {"call":"exampleFunction", "status":"success"});
    ```

Example output: `2024-03-18T12:27:20.895Z [INFO] - This is a status info message. {"call":"exampleFunction","status":"success"}`

**creating wrong parameters is considered an internal or critical error. errors coming from the customerLogger itself are written to `./_internalError.log`**


## Configuration Options
The `CustomLogger` can be configured both programmatically and via environment variables:

- `verboseLogging`: Toggle verbose logging to the console. Defaults to `false`.
- `verboseReporting`: Toggle logging of regular messages to files. Defaults to `false`.
- `errorReporting`: Toggle logging of error messages to files. Defaults to `true`.
- `logLevel`: Specify minimum recorded log level. Order is debug < log < info < warn < error. Wrapped functions report in log. Defaults to `info`. 
- `logDirectory`: Directory for log files. Defaults to `./logs`.
- `errorLogDirectory`: Directory for error log files. Defaults to `./logs/errors`.
- `deleteAfterDays`: Days before log deletion, managed by node-schedule. Defaults to `null`.
- `splitLogs`: Determines if logs should be split by type (logLevel) or combined into a single file (excluding errors). Defaults to `true`.

Environment variables should be prefixed with `customLogger_`, e.g., `customLogger_verboseLogging = true`.
Overruling structure is as follows: **Code Defaults < Environment Vars < Class Instance**  

- `logFormatter`: Sets the logging format structure. Can NOT be set by environment vars. Default structure:
    ``(level, message, context) => `${new Date().toISOString()} [${level.toUpperCase()}] - ${message} ${JSON.stringify(context)}`,``


#### Invoke a logger Class with Custom Options

- You can set custom options by creating a class instance:

    ```
    const newLoggerExample = new CustomLogger({
    verboseLogging: true,
    logLevel: 'debug',
    logDirectory: '/path/to/debug/logs',
    splitLogs: false
    //...etc.
    });
    newLoggerExample.debug("I'm unique with my own options");
    ```
These options are just examples, you can use any relevant options. They're not required.


#### Overrule Custom and Default options

For safety, quick logging and development-to-production efforts you can overrule all custom and default options via environment variables. E.g., `process.env.customLogger_envOverrule = true` will allow you to set any options by env rules, except for logFormatter.


## Contributing

Contributions are welcome! Ways to contribute:

- Report issues and suggest features.
- Submit pull requests with bug fixes or new features.
- Improve documentation.

Fork the repository and submit pull requests to contribute.

P.S. This logger looks similar to a very old project. That's completely coincidental, but I'd still like to reference it: https://www.npmjs.com/package/custom-logger