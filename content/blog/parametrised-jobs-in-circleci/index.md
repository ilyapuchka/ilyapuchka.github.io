---
id: 5b6f5a3a9d28c70f0f015f89
title: Parameterized jobs in CircleCI
date: 2018-08-07T18:41:12.000Z
description: ""
tags: ""
---

The title is a lie - there is no such thing as parameterized jobs (at the time of writing, but seems it’s going to be improved in [2.1](https://github.com/CircleCI-Public/config-preview-sdk/blob/master/docs/whats-new.md)) when we are talking about CircleCI 2.0 workflows, which are (almost) awesome by the way. But with some tricks, we can achieve something close to that.

<!-- description -->

Here is the problem. Let's say we have a bunch of jobs which are exactly the same except what build or test command they invoke in the end. They all need to perform the same sequence of actions:

- checkout code
- install dependencies (different Homebrew packages, Ruby gems, CocoaPods and/or Carthage dependencies)
- cache all of that so that future jobs don't spend more time than needed downloading everything all over again
- run some build or test command, i.e. execute some lane or rake task
- save artifacts and test results

That's a lot of boilerplate. How do we avoid repeating it and yet have different jobs for different tasks?

CircleCI 2.0 offers different ways to simplify such configuration, which are very well described in its documentation: we can use cache to store dependencies based on lock-file checksums, and we can use workflows to break all these steps into separate jobs and use workspaces to share data between them.

Unfortunately, I found that using workspaces adds significant overhead to the total time of the workflow (it was about 8 minutes in my case, which is pretty close to 50% of total workflow time without workspaces). If we extract checkout and dependencies installation steps into a separate job then we'll need to persist into the workspace all the content in the working directory. And yes, it will also persist whole `.git` folder. This adds several minutes to archive and then unarchive in the next job. Additionally, we might need to store Derived Data to use `build-for-testing` and `test-without-building` features of `xcodebuild` to pass it between build and test jobs. This adds time again. So even though now we have a nice pipeline where we first checkout, then build, then execute tests in parallel, such workflow can become much longer to run. And it does not give apparent performance improvements compared with a workflow that simply performs all the same steps for each of the jobs in parallel.

For that reason, I had to opt out using workspaces and had to repeat all of the steps in each job...

        regression_test_bupa:
             <<: *container_config
    
             steps:
                 - checkout
                 - *lfs
                 - *brew
                 - *restore_gems_cache
                 - *bundle_install
                 - *save_gems_cache
                 - *restore_cocoapods_cache
                 - *pod_install
                 - *save_cocoapods_cache
                 - *restore_carthage_cache
    
                 - run:
                     name: Fastlane
                     no_output_timeout: 60m
                     command: bundle exec fastlane regression_test_bupa
    
                 - *store_fastlane_output
                 - *store_scan_results
                 - *store_snapshot_diffs

There is a YAML feature that I use here to avoid even more repetitions - aliases. This way I extract configurations common for each job:

        - &container_config
            macos:
                xcode: "9.4.1"
            working_directory: /Users/distiller/project
            shell: /bin/bash --login -eo pipefail
            environment:
                LC_ALL: en_US.UTF-8
                LANG: en_US.UTF-8
                SCAN_DEVICE: iPhone 5s
                FL_OUTPUT_DIR: output
                FASTLANE_XCODEBUILD_SETTINGS_RETRIES: 10

or individual steps, i.e. installing CocoaPods:

        - &cocoapods_cache_key
            2-pods-{{ checksum "Podfile.lock" }}
    
        - &restore_cocoapods_cache
            restore_cache:
                key: *cocoapods_cache_key
    
        - &pod_install
            run:
                name: Pod Install
                command: |
                    bundle exec pod --version
                    diff Podfile.lock Pods/Manifest.lock || curl https://cocoapods-specs.circleci.com/fetch-cocoapods-repo-from-s3.sh | bash -s cf
                    bundle exec pod install
    
        - &save_cocoapods_cache
            save_cache:
                key: *cocoapods_cache_key
                paths:
                    - Pods
                    - ~/.cocoapods/repos

But YAML aliases don't support arrays, so can't be used to reuse steps definition between jobs.

It was fine in the beginning but when I started to move other jobs from Jenkins to CircleCI, config file grew immensely. Turns out that I already knew the solution for that, just didn't see it. There is the answer to that problem [here](https://discuss.circleci.com/t/parameterized-jobs-within-workflows/16662/2) but it does not go into details. So here we go.

As I mentioned before YAML aliases support only key-value pairs, not collections. So then we can extract `steps` key-value pair into an alias that we can then include in each job.

        - &fastlane
            run:
                name: Fastlane
                no_output_timeout: 60m
                command: bundle exec fastlane ???
    
        - &base_steps
            steps:
                - checkout
                - *lfs
                - *brew
                - *restore_gems_cache
                - *bundle_install
                - *save_gems_cache
                - *restore_cocoapods_cache
                - *pod_install
                - *save_cocoapods_cache
                - *restore_carthage_cache
    
                - *fastlane
    
                - *store_fastlane_output
                - *store_scan_results
                - *store_snapshot_diffs

But that does not allow us to override individual steps, like `fastlane` step here, so that we can perform different build or test commands in different jobs. We can only override all steps or none of them.

But we can use environment variables as parameters for these commands. Using Fastlane (or Rakefile, or Makefile) simplifies that a lot because we only need to set an environment variable with a name of a lane or rake task. And we might not even need it because we can use job name already exposed as environment variable out of the box.

        - &fastlane
            run:
                name: Fastlane
                no_output_timeout: 60m
                command: bundle exec fastlane ${LANE:-$CIRCLE_JOB}

To be able to override/add environment variables we also need to extract `environment` key-value pair into an alias:

        - &env_defaults
            LC_ALL: en_US.UTF-8
            LANG: en_US.UTF-8
            SCAN_DEVICE: iPhone 5s
            FL_OUTPUT_DIR: output
            FASTLANE_XCODEBUILD_SETTINGS_RETRIES: 10
    
        - &container_config
            macos:
                xcode: "9.4.1"
            working_directory: /Users/distiller/project
            shell: /bin/bash --login -eo pipefail
            environment:
                <<: *env_defaults

And now to define a "parametrized" job we need just a few lines:

    jobs:
        build_bupa_for_distribution:
            <<: *container_config
            <<: *base_steps
    
        test_bupa:
            <<: *container_config
            <<: *base_steps
    
        regression_test_bupa:
            <<: *container_config
            environment:
                <<: *env_defaults
                SCAN_DEVICE: iPhone 8 Plus (11.4)
            <<: *base_steps

Each of these jobs will perform exactly the same steps before invoking specific lane, defined by the name of the job and using default environment variables. If needed we can override lane name setting `LANE` environment variable. And for UI tests we can also override the type of simulator device to run them on (I couldn't make it work with `SCAN_DEVICES` though).

As a result, config file became around 2 times smaller - from initial 700 lines it went to just 370.

This way we can parametrize any number of steps, or even skip some steps (out of the box workflows only can skip whole jobs, not individual steps, and only based on a branch or a tag name). And extracting steps into Fast/Rake/Make-file will not only make this task simpler but will also help to keep config file clean.
