# FeedHenry Hello World MBaaS Server

This is a blank 'hello world' FeedHenry MBaaS. Use it as a starting point for building your APIs. 

# Group Hello World API

# hello [/hello]

'Hello world' endpoint.

## hello [POST] 

'Hello world' endpoint.

+ Request (application/json)
    + Body
            {
              "hello": "world"
            }

+ Response 200 (application/json)
    + Body
            {
              "msg": "Hello world"
            }
            
### Testing
Unit tests are setup and can be run using Gulp

* Install grunt: ```npm install --global gulp-cli```
* Run ```gulp test:unit``` for unit tests

Unit tests use `Mocha`framework.  Tests are in ``test/unit`` folder

