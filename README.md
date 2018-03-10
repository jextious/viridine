# Viridine
Viridine is a simple(ish) lightweight HTTP server running on NodeJS.

## Running a Server
To run the server at its default settings, simply run:
```
node index.js
```
To run the server on a different port, add:
```
node index.js -p 8080
```

## Command Line Arguments
* -p or -port to define the port (default is 80)
* -t or -terminal to display various messages

## Configuration
When the server is first run, it will create the default configuration file if it does not exist. Most settings should be self-explanatory. The only thing worth noting is instead of defining individual servers, "_" can be used as the default server (if none are found).

## JSS Functions
To be able to use dynamic content on a server, scripts need the .jss extension. A JSS script consists of pure JavaScript, with the addition of a bunch of useful functions provided by Viridine.

**urlEncode**(str)
- *str* - The string to be encoded.

**htmlEntities**(str)
- *str* - The input string.

**addSlashes**(str)
- *str* - The string to be escaped.

**ucFirst**(str)
- *str* - The input string.

**isSet**(var)
- *var* - The variable to be checked.

**isNumeric**(var)
- *var* - The variable being evaluated.

**numberFormat**(number[, sep])
- *number* - The number to be formatted.
- *sep* - The thousands separator; "," by default.

**escapeUnicode**(str)
- *str* - The string to be escaped.

**echo**(str)
- *str* - The string to output. Can also be an object.

**setHeader**(name, value)
- *name* - The name of the header.
- *value* - The value of the header.

**setCache**(bool[, time])
- *bool* - Whether to send the "last modified" header.
- *time* - The max age of the "cache control" header.

**setCookie**(name, value[, expire[, path[, domain[, secure[, http]]]]])
- *name* - Name of the cookie.
- *value* - Value of the cookie.
- *expire* - The expiration date; 0 for session, -1 to destroy the cookie.
- *path* - The path of the site the cookie will be available on.
- *domain* - The domain the cookie is available to.
- *secure* - Whether the cookie should be used over HTTPS.
- *http* - Whether the cookie should be HTTP-only.

**setStatus**(code)
- *code* - The code of the status.

**scanDir**(dir)
- *dir* - The directory to be scanned.

**makeDir**(dir)
- *dir* - The directory to be created.

**removeDir**(dir)
- *dir* - The directory to be removed.

**fileRename**(old, new)
- *old* - The old name.
- *new* - The new name.

**fileCopy**(src, dest)
- *src* - The source file to be copied.
- *dest* - The path of the destinaton.

**fileExists**(file)
- *file* - Path to the file.

**fileGetContents**(file)
- *file* - Path to the file.

**filePutContents**(file, data)
- *file* - Path to the file.
- *data* - The data to be written to the file.

**fileUnlink**(file)
- *file* - The file to be removed.

**fileStats**(file)
- *file* - Path to the file.

**setIncludePath**(path)
- *path* - The new path.

**include**(file)
- *file* - The file to be included.

**includeOnce**(file)
- *file* - The file to be included if it hasn't already.

**sessionStart**()

**sesionDestroy**([all])
- *all* - Whether to destroy every single session.

**mysqlConnect**(conn[, callback])
- *conn* - The connection options.
- *callback* - The callback.

**mysqlQuery**(query[, values[, callback]])
- *query* - The MySQL query.
- *values* - The values of the query.
- *callback* - The callback.

**mysqlClose**([callback])
- *callback* - The callback.

**exit**([str])
- *str* - The string to be outputted.

## Reserved Variables
In addition to the JSS functions, a few global variables are also available.

**SERVER**

This object consists of data related to the current server request.

**SESSION**

This object holds all the data from a visitor's session.

**GET**

An object of all the GET variables passed to a script.

**POST**

An object of all the POST variables passed to a script.

**FILES**

This object contains information about the files that were just uploaded by a visitor.

**DATA**

This object can be used to store site data that will be needed a lot.

**COOKIE**

All of a visitor's cookies are stored in this object.