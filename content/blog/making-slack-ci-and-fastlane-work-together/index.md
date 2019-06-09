---
id: 5ca0c61ee50b131c1451e27f
title: Making Slack, CircleCI and Fastlane work together
date: 2019-06-08T14:00:48.000Z
description: ""
tags: ""
---

Nowadays Slack, some kind of CI and often Fastlane are default tools in a toolset of iOS developers. These tools serve their own purposes well, but wouldn't they do it better when they all work together? In this tutorial, I'll describe how to connect Slack with CircleCI and Fastlane. I'll be using CircleCI as an example but it's pretty much the same with any modern CI solution. As a bonus, we will do that in Swift using Vapor 3.0. So this tutorial can be as well an introduction to Swift on the server with Vapor framework.

<!-- description -->

## Running Fastlane on CI

I touched in depth the details of configuring CircleCI in a dynamic way so that you can reuse as much configuration as you can without repeating common steps in each job, so I won't go into details here and will just highlight the main ideas.

While CircleCI support for triggering workflows with API calls is still very limited we will use a build job. As it's not run as a part of a workflow we will need to define a job that would run all the required steps like `checkout`, `bundle_install`, etc. To be able to reuse those steps in other jobs we will define them using YAML aliases (I described this approach [here](https://ilya.puchka.me/parametrised-jobs-in-circleci/), if you already using [CircleCI 2.1](https://circleci.com/docs/2.0/reusing-config/) you probably won't need this):

    references:
        - &fastlane
                run:
                    name: Fastlane
                    command: |
                        if [[$CIRCLE_JOB == fastlane]] ; then
                            if [[-n "${FASTLANE}"]]; then
    				eval "bundle exec fastlane ${FASTLANE} ${OPTIONS}"
    			fi
    
        - &all_steps
                steps:
                    - checkout
                    - *brew
                    - *restore_gems_cache
                    - *bundle_install
                    - *save_gems_cache
                    - *restore_cocoapods_cache
                    - *pod_install
                    - *save_cocoapods_cache
                    - *fastlane
                    - *store_fastlane_output
    
    jobs:
        fastlane:
            <<: *container_config
            <<: *all_steps

Alias `fastlane` defines a step that checks for environment variable `CIRCLE_JOB` to check if this step is running within a job that was triggered with an API call (it will be the first job defined in the jobs list). Then we check if `FASTLANE` and `OPTIONS` environment variables are defined and use them in a call to fastlane.

## CircleCI service

To trigger such job and run a specific lane on CircleCI we need to make a request to the CircleCI API. For that, we create a service type responsible for interacting with CircleCI API.

    struct CircleCIService: Service {
        private let baseURL = URL(string: "https://circleci.com")!
        private let headers: HTTPHeaders = [
            "Content-Type": "application/json",
            "Accept": "application/json"
        ]
    
        let token: String
        let project: String
    }

> Conforming to `Service` protocol defined in Vapor is not required and in fact, it does not have any requirements, but doing so will allow us to register this type in Vapors DI container which can become handy at some point later.

To work with CircleCI API we'll need a token that you can create on its dashboard and a project name.

To trigger a job that would run a specific lane we need to make CircleCI aware of this lane name and its options. This is done by sending `build_parameters` property in the API request body. This key expects strings key-value pairs which will be made accessible to CircleCI as environment variables.

    {
        "build_parameters: {
            "FASTLANE": "test",
            "OPTIONS": "branch:master"
        }
    }

If the API call successfully triggered a job the response will contain a `build_url` parameter with a link to the job's dashboard and a branch on which it is running. To work with these parameters we create request and response types:

    extension CircleCIService {
        struct BuildRequest: Content {
            let buildParameters: [String: String]
    
            enum CodingKeys: String, CodingKey {
                case buildParameters = "build_parameters"
            }
        }
    
        public struct BuildResponse: Content {
            public let branch: String
            public let buildURL: String
    
            enum CodingKeys: String, CodingKey {
                case branch
                case buildURL = "build_url"
            }
        }
    }

> Using `Content` protocol defined in Vapor is not strictly necessary here - `Codable` will work just fine, but it makes it slightly easier to encode/decode data in the Vapor environment.

Now we can actually implement the API call:

    extension CircleCIService {
        public func run(
            parameters: [String: String],
            branch: String,
            on request: Request
        ) throws -> Future<BuildResponse> {
            let url = URL(
                string: "/api/v1.1/project/github/\(project)/tree/\(branch)?circle-token=\(token)",
                relativeTo: baseURL
            )!
            let request = BuildRequest(buildParameters: parameters)
            return try request.client().post(url, headers: headers) {
                try $0.content.encode(request)
            }
        }
    }

## Slack service

To communicate with Slack we will use [slash commands](https://api.slack.com/slash-commands). To implement them we need first to create a Slack app and register a slash command in it. To invoke it we will need to send a Slack message that would like like `/fastlane test branch:master`, where `fastlane` is the name of the command (slash commands are always prefixed with `/`) and the rest is the text of the command that our Vapor app will parse to extract the name of the lane (in this case `test`) and its options (in this case `branch:master`).

When it's done we need to implement the endpoint in our Vapor app that will be called by Slack when someone triggers this slash command. The request made by Slack to this endpoint will contain some metadata in its body that contains the text of the command itself and some additional data, like the channel name where the command was invoked, the security token and response URL (more details about this later).

    struct SlackCommandMetadata: Content {
        let token: String
        let channelName: String
        let text: String
        let responseURL: String
    
        enum CodingKeys: String, CodingKey {
            case token
            case channelName = "channel_name"
            case text
            case responseURL = "response_url"
        }
    }

After the request is sent to our app by Slack it will expect the response. It should contain a text and flag that would instruct Slack to make the response visible either only to the user who invoked the slash command (that's called "ephemeral" response) or to everyone in the channel where the command was invoked.

    struct SlackResponse: Content {
        let text: String
        let visibility: Visibility
    
        enum Visibility: String, Content {
            case user = "ephemeral"
            case channel = "in_channel"
        }
    
        enum CodingKeys: String, CodingKey {
            case text
            case visibility = "response_type"
        }
    }

This response can be sent to Slack right after the command was processed as a response to the incoming HTTP request or later using `responseURL`. This is helpful because Slack has a 3 seconds timeout for slash commands responses. We could just send some generic response right away, i.e. `Ok, will trigger CircleCI job now`, but it will be more useful if this response would contain a URL to the triggered job. Sometimes CircleCI takes a bit longer to trigger the job and we'll need to wait for it to return the response with a job URL so we will do that by sending this data to the `responseURL` when a request to CircleCI API returns it.

    extension Future where T == SlackResponse {
        func replyLater(
            withImmediateResponse immediateResponse: SlackResponse,
            responseURL: String,
            on request: Request
        ) -> Future<SlackResponse> {
            _ = self
                .mapIfError { SlackResponse($0.localizedDescription) }
                .flatMap { response in
                    try request.client()
                        .post(responseURL) {
                            try $0.content.encode(response)
                        }
            }
    
            return request.eventLoop.future(immediateResponse)
        }
    }

Now to be able to handle a slash command in our app we need to describe it in code. For that we will introduce a `SlackCommand` type responsible for parsing the incoming request, triggering CircleCI service and sending results back to Slack, and `SlackService` responsible for handling a command on a high level:

    struct SlackCommand {
        let name: String
        let help: String
        let run: (SlackCommandMetadata, Request) throws -> Future<SlackResponse>
    }
    
    struct SlackService {
        let token: String
    
        func handle(command: SlackCommand, on request: Request) throws -> Future<Response> {
            return try request.content
                .decode(SlackCommandMetadata.self)
                .flatMap { [token] metadata in
                    guard metadata.token == token else {
                        throw Error.invalidToken
                    }
                    
                    if metadata.text == "help" {
                        return request.future(SlackResponse(command.help))
                    } else {
                        return try command.run(metadata, request)
                    }
                }
                .mapIfError { SlackResponse($0.localizedDescription) }
                .encode(for: request)
        }
    }
            
    extension SlackService {
        enum Error: Swift.Error {
            case invalidToken
            case missingParameter(key: String)
            case invalidParameter(key: String, value: String, expected: String)
        }
    }

First `SlackService` extracts the command metadata from the incoming request and verifies its token (Slack docs say that it's a deprecated way of verifying requests made by Slack but its fine for our purposes for now). Then if the request was to show the command usage instructions (i.e. `/fastlane help`) we return these instructions in the response. Otherwise, we trigger the command using its `run` closure.

Now we have everything ready to implement the actual command:

    extension SlackCommand {
        static let fastlane = { (ci: CircleCIService) in
            SlackCommand(
                name: "fastlane",
                help: "Invokes specified lane on specified branch...",
                run: { metadata, request in
                    try runLane(
                        metadata: metadata,
                        ci: ci,
                        on: request
                    )
            })
        }
    
        private static func runLane(
            metadata: SlackCommandMetadata,
            ci: CircleCIService,
            on request: Request
        ) throws -> Future<SlackResponse> {
            let components = metadata.text.components(separatedBy: " ")
            let lane = components[0]
            let options = components.dropFirst().joined(separator: " ")
            let branch = components.dropFirst()
                .first { $0.hasPrefix("branch:") }?
                .dropFirst("branch:".count)
            let parameters = ["FASTLANE": lane, "OPTIONS": options]
    
            return try ci
                .run(
                    parameters: parameters,
                    branch: branch ?? "master",
                    on: request
                )
                .map { (response: CircleCIService.BuildResponse) in
                    SlackResponse("""
                        🚀 Triggered `\(lane)` on the `\(response.branch)` branch.
                        \(response.buildURL)
                        """,
                        visibility: .channel
                    )
                }
                .replyLater(
                    withImmediateResponse: SlackResponse("👍"),
                    responseURL: metadata.responseURL,
                    on: request
                )
        }
    }

Our command first performs some trivial string parsing to extract a lane name, its options, and a branch name and then uses that in a call to CircleCI service. When this call completes we convert its response to the Slack message that contains the job URL and we send it back to the Slack as a delayed response.

To connect all these pieces together we now need to register a route in our Vapor app in the `routes.swift` file :

    public func routes(
        router: Router,
        slack: SlackService,
        commands: [SlackCommand]
    ) throws {
        commands.forEach { command in
            router.post(command.name) { req -> Future<Response> in
                do {
                    return try slack.handle(command: command, on: req)
                } catch {
                    return try SlackResponse(error.localizedDescription)
                        .encode(for: req)
                }
            }
        }
    }

and configure Slack and CircleCI services in the `configure.swift` file:

    public func configure(_ config: inout Config, _ env: inout Environment, _ services: inout Services) throws {
        let slack = SlackService(
            token: Environment.get("SLACK_TOKEN")
        )
    
        let ci = CircleCIService(
            token: Environment.get("CIRCLECI_TOKEN")!,
            project: Environment.get("CIRCLECI_PROJECT")!
        )
    
        let router = EngineRouter.default()
        try routes(
            router: router, 
            slack: slack, 
            commands: [
                .fastlane(ci)
            ]
        )
        services.register(router, as: Router.self)
        ...
    }

And we are done! If you want to test the app you need to set environment variables in the Xcode scheme and just run the app. It will run it on the `localhost` and you'll be able to send requests to it (I use [Insomnia](https://insomnia.rest) for that). Then deploy the app to the platform of your choice (we use Heroku for that), update the slash command with the actual URL of your app and enjoy!

## Conclusion

In Babylon iOS team we use this integration dozen of times daily and it proved to be very useful. So we decided to share it with the community and to opensource our app! We call it `Stevenson` - the original app, written with Vapor 2.0, was called `Steve` - and you can find it on our [GitHub](https://github.com/Babylonpartners/Stevenson). It contains the code for our app itself and a reusable framework that you can use in your own apps. If you use or built yourself similar Slack apps in your team we'll be happy to hear from you about how you use them!
