var gulp = require('gulp');
var shell = require('gulp-shell');
var fs = require('fs');
var request = require('request');
var async = require('async');
var fhc = require('fh-fhc');
var sendGrid = require('sendgrid').mail;
var runSequence = require('run-sequence');

process.env.rhmapCloudConfig = './rhmap.conf-cloud.json';

gulp.task('test:unit', shell.task([
  'env NODE_PATH=. ./node_modules/.bin/mocha -A -u exports -t 8000 --recursive test/unit/'
]));

gulp.task('default', ['test:unit']);

//Initalise properties in the rhmap.conf-cloud.json file if they do not exist
gulp.task('fhc-cloud-setup', ['fhc-login-apikey'], function(done){
    var rhmapConfFileContent = {},
        requestsArr = [];

    //Check if the config file exists
    var configExists = fs.existsSync(process.env.rhmapCloudConfig);

    //If it doesn't, create a new blank file
    // If it does, read it so we can check if properties already exist within it
    if(!configExists){
        fs.writeFileSync(process.env.rhmapCloudConfig, JSON.stringify({}));
    } else {
        rhmapConfFileContent = JSON.parse(fs.readFileSync(process.env.rhmapCloudConfig));
    }

    if(!rhmapConfFileContent.appid){
        rhmapConfFileContent.appid = "";
    }

    if(!rhmapConfFileContent.host){
        rhmapConfFileContent.host = "";
    }

    if(!rhmapConfFileContent.projectid){
        rhmapConfFileContent.projectid = "";
    }

    if(!rhmapConfFileContent.login){
        rhmapConfFileContent.login = {};
    }

    if(!rhmapConfFileContent.login.username){
        rhmapConfFileContent.login.username = "";
    }

    if(!rhmapConfFileContent.login.password){
        rhmapConfFileContent.login.password = "";
    }


    if(!rhmapConfFileContent.login.apikey){
        rhmapConfFileContent.login.apikey = "";
    }

    if(!rhmapConfFileContent.deploy){
        rhmapConfFileContent.deploy = {};
    }

    //Populates the config with all environments currently in RHMAP
    if(!rhmapConfFileContent.deploy.environments){
        rhmapConfFileContent.deploy.environments = [];
    }
    //Calling this seperately to add any new environments that have been created and the property in the config already exists
    requestsArr.push(function(callback){fhcLoad(function(){
        fhc.admin.environments.list({_: []}, function(err, environments){
            if (err) return done(err);

            var envStructured = [];
            //Loop over the returned RHMAP environments
            for(var i=0; i < environments.length; i++){
                var environment = environments[i],
                    configEnvs = rhmapConfFileContent.deploy.environments,
                    alreadyExists = false,
                    existingDeploy;

                //Loop over the config environments to check if the current returned environment is already present and save the deploy property
                for(var j=0; j < configEnvs.length; j++){
                    if(configEnvs[j].envId === environment.id){
                        alreadyExists = true;
                        existingDeploy = configEnvs[j].deploy;
                        break;
                    }
                }

                var deploy = environment.label.toLowerCase().indexOf('dev') > -1;
                //Completely overwriting the current environments in the config file in case a env has been deleted from RHMAP.
                //Just need to persist user changes to deploy property
                envStructured.push({
                    envId: environment.id,
                    name: environment.label,
                    deploy: alreadyExists ? existingDeploy : deploy
                })
            }

            rhmapConfFileContent.deploy.environments = envStructured;

            callback();
        });
    })});

    //TODO - QUESTION - Should this change to develop branch by default? What branches are created on the project by default?
    if(!rhmapConfFileContent.deploy.branch){
        rhmapConfFileContent.deploy.branch = "master";
    }

    //Only reason to use async.parallel is to have a single function once all async requests are finished to call done() which lets gulp know the task is finished and do other common tasks like write to config file
    async.parallel(requestsArr, function(err, results){
        //write back to config file
        fs.writeFileSync(process.env.rhmapCloudConfig, JSON.stringify(rhmapConfFileContent, null, '\t'));

        done();
    })
})

//deploy cloud app
gulp.task('fhc-cloud-deploy', ['fhc-cloud-setup'], function(done) {
    var rhmapConfFileContent = JSON.parse(fs.readFileSync(process.env.rhmapCloudConfig)),
        environments = rhmapConfFileContent.deploy.environments,
        requestsArr = [];

    //loop over all environments in config file to deploy each one
    environments.forEach(function(environment){
        //Don't deploy if deploy is set to false
        if(!environment.deploy){
            return;
        }

        var environmentName = environment.name;

        requestsArr.push(function(callback){fhcLoad(function(){
            console.log("Environment " + environmentName + " started deploying");
            fhc.app.stage({app: rhmapConfFileContent.appid, env: environment.envId, gitRef : {type: "branch", hash: "HEAD",  value: rhmapConfFileContent.deploy.branch} }, function(err, res){
                if (err) return done(err);

                console.log("Environment " + environmentName + " finished deploying with a status of " + res[0][0].status);

                callback();
            });
        })});
    });

    //Only reason to use async.parallel is to have a single function once all async requests are finished to call done() which lets gulp know the task is finished and do other common tasks like write to config file
    async.parallel(requestsArr, function(err, results){
        done();
    })
})

gulp.task('fhc-cloud-start', ['fhc-cloud-deploy'], function(done) {
    var rhmapConfFileContent = JSON.parse(fs.readFileSync(process.env.rhmapCloudConfig)),
        environments = rhmapConfFileContent.deploy.environments,
        requestsArr = [];

    //loop over all environments in config file to start each one
    environments.forEach(function(environment){
        //Don't start if deploy is set to false
        if(!environment.deploy){
            return;
        }

        var environmentName = environment.name;

        requestsArr.push(function(callback){fhcLoad(function(){
            console.log("Environment " + environmentName + " starting");
            fhcLoad(function(){
                fhc.app.start({app: rhmapConfFileContent.appid, env: environment.envId}, function(err, res){
                    if (err) return done(err);

                    console.log("Environment " + environmentName + " finished starting");

                    callback();
                });
            });
        })});
    });

    //Only reason to use async.parallel is to have a single function once all async requests are finished to call done() which lets gulp know the task is finished and do other common tasks like write to config file
    async.parallel(requestsArr, function(err, results){
        done();
    })
})

gulp.task('fhc-cloud-stop', ['fhc-cloud-setup'], function(done) {
    var rhmapConfFileContent = JSON.parse(fs.readFileSync(process.env.rhmapCloudConfig)),
        environments = rhmapConfFileContent.deploy.environments,
        requestsArr = [];

    //loop over all environments in config file to stop each one
    environments.forEach(function(environment){
        //Don't stop if deploy is set to false
        if(!environment.deploy){
            return;
        }

        var environmentName = environment.name;

        requestsArr.push(function(callback){fhcLoad(function(){
            console.log("Environment " + environmentName + " stopping");
            fhcLoad(function(){
                fhc.app.stop({app: rhmapConfFileContent.appid, env: environment.envId}, function(err, res){
                    if (err) return done(err);

                    console.log("Environment " + environmentName + " finished stopping");

                    callback();
                });
            });
        })});
    });

    //Only reason to use async.parallel is to have a single function once all async requests are finished to call done() which lets gulp know the task is finished and do other common tasks like write to config file
    async.parallel(requestsArr, function(err, results){
        done();
    })
})

//restart cloud app
gulp.task('fhc-cloud-restart', function(done){
    runSequence('fhc-cloud-stop', 'fhc-cloud-start', done);
});

//Sets the target host for fhc to talk too
gulp.task('fhc-target', function(done){
	var configExists = fs.existsSync(process.env.rhmapCloudConfig);

    if(!configExists){
      console.log("Please create "+process.env.rhmapCloudConfig+" file in your cloud app folder.");

        done(new Error("Config file not found"));
    } else {
    	var rhmapConfFileContent = JSON.parse(fs.readFileSync(process.env.rhmapCloudConfig));
      if (!rhmapConfFileContent.host){
        console.log('Please specify the host in the ' + process.env.rhmapCloudConfig + ' file')
        done(new Error("Host not specified in config file."));
        return ;
      }

        fhcLoad(function(){
	        fhc.fhcfg({_ : ["get", "feedhenry"]}, function(err, host){
	            if (err) return done(err);
	            //Checking if the currently connected to host is the same as what is in the config file
	            //if it's not, then target the host in the config file
	            if(host.slice(0, -1) !== rhmapConfFileContent.host){
	                fhcLoad(function(){
	                    fhc.target({_ : [rhmapConfFileContent.host]}, function(err, res){
	                        if (err) return done(err);

	                        console.log("Successfully targeted " + rhmapConfFileContent.host);

	                        done();
	                    });
	                }, done);
	            } else {
	                done();
	            }
	        });
	    }, done);
    }
})

//fhc also needs an authenticated user
gulp.task('fhc-login-basic', ['fhc-target'], function(done){
    var configExists = fs.existsSync(process.env.rhmapCloudConfig);

    //If it doesn't, create a new blank file
    // If it does, read it
    if(!configExists){
        console.log('Please specify the username and password in the ' + process.env.rhmapCloudConfig + ' file')
        done();
    } else {
        var rhmapConfFileContent = JSON.parse(fs.readFileSync(process.env.rhmapCloudConfig));

        fhcLoad(function(){
			fhc.fhcfg({_ : ["get", "username"]}, function(err, username){
				if (err) return done(err);
				//Checking if the currently logged in user is the same as what is in the config file
				//if it's not, then login the user that's in the config file
				if(username !== rhmapConfFileContent.login.username){
					fhcLoad(function(){
				    	fhc.login({_ : [rhmapConfFileContent.login.username, rhmapConfFileContent.login.password]}, function(err, res){
				        	if (err) return done(err);

				        	console.log("Finished login with status of '" + res.result + "' by user " + rhmapConfFileContent.login.username + " to the domain " + res.domain);

				        	done();
				    	});
					}, done);
				} else {
					done();
				}
			});
      	}, done);
    }
})

//fhc also needs an authenticated user
gulp.task('fhc-login-apikey', ['fhc-target'], function(done){

    var configExists = fs.existsSync(process.env.rhmapCloudConfig);

    //If it doesn't, create a new blank file
    // If it does, read it
    if(!configExists){
        fs.writeFileSync(process.env.rhmapCloudConfig, JSON.stringify({}));
        console.log('Please specify the api key in the ' + process.env.rhmapCloudConfig + ' file');
        done();
    } else{
        var rhmapConfFileContent = JSON.parse(fs.readFileSync(process.env.rhmapCloudConfig)),
            apiKey = rhmapConfFileContent.login.apikey;

        if(!apiKey){
            console.log('Please specify the api key in the ' + process.env.rhmapCloudConfig + ' file');
            return done(new Error("API key not specified"));
        }

        fhcLoad(function(){
            fhc.fhcfg({_ : ["get", "user_api_key"]}, function(err, cfgApiKey){
                if (err) return done(err);
                //Checking if the currently stored api key is the same as what is in the config file
                //if it's not, then set the api key in teh cfg file
                if(cfgApiKey !== apiKey){
                    fhcLoad(function(){
                        fhc.fhcfg({_ : ["set", "user_api_key", apiKey]}, function(err, res){
                            if (err) return done(err);

                            console.log("Finished setting API key");

                            done();
                        });
                    }, done);
                } else {
                    done();
                }
            });
        }, done);
    }
})

//set properties in config file. Use format --property=value
gulp.task('fhc-set-config', function(done){

    var configExists = fs.existsSync(process.env.rhmapCloudConfig),
        args = structureArgs(process.argv);

    if(!configExists){
        console.log('Config file does not exist, please run fhc-cloud-setup')
    } else if (isEmpty(args)){
        console.log('No arguments specified. should be structured as --argument=value')
    } else {
        var rhmapConfFileContent = JSON.parse(fs.readFileSync(process.env.rhmapCloudConfig));

        for (var key in args) {
            if (args.hasOwnProperty(key)) {
                var exists = rhmapConfFileContent[key],
                    text = exists ? "Changed " : "Added ";

                console.log(text + "property: " + key + ". old value: " + rhmapConfFileContent[key] + ", new value: " + args[key])
                rhmapConfFileContent[key] = args[key];
            }
        }

        fs.writeFileSync(process.env.rhmapCloudConfig, JSON.stringify(rhmapConfFileContent, null, '\t'));
    }

    done();
})

//Read from config. PRints entire config to console if no parameter set. Otherwise use format --property
gulp.task('fhc-get-config', function(done){

    var configExists = fs.existsSync(process.env.rhmapCloudConfig),
        args = process.argv;

    if(!configExists){
        console.log('Config file does not exist, please run fhc-client-setup')
    } else {
        var rhmapConfFileContent = JSON.parse(fs.readFileSync(process.env.rhmapCloudConfig));

        if (args.length <= 3){
            console.log(rhmapConfFileContent);
            return done();
        }

        var key = process.argv[3].substring(2);

        if(rhmapConfFileContent[key]){
            console.log(key + " = " + rhmapConfFileContent[key]);
        } else {
            console.log('Property ' + key + ' does not exist');
        }
    }

    done();
})

//all command through the fhc module need to be wrapped inside an fhcLoad
function fhcLoad(func, done){
    var conf = {
      _exit: false
    };

    fhc.load(conf, function(err){
        if (err) return done(err);

        func();
    });
}

function isEmpty(obj) {
  return !Object.keys(obj).length > 0;
}