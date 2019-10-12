---
id: 5b6f5a3a9d28c70f0f015f65
title: Networking in Swift
date: 2015-09-10T19:10:13.000Z
description: ""
tags: Swift
---

Recently I've updated my post on how you can implement lightweight networking in Objective-C. Now it's time to look at the same problem from perspective of Swift. If you want to check out code right away you can do it on [Github](https://github.com/ilyapuchka/SwiftNetworking).

<!-- description -->

As AFNetowrking is the default tool of choice for most of Objective-C developers, [Alamofire](https://github.com/Alamofire/Alamofire) became such in Swift community. But it's always useful to practice and find your own solutions. So let's look how we can do networking by ourselves and what we can achieve there using powerful Swift features like generics, structs and enums.

#### Endpoints

When you make HTTP request you reach some endpoint or resource on the remote server. This endpoint describes HTPP method you can use to access it, path of the resource, query parameters. We can minimally describe endpoint using protocol:

```swift
public protocol Endpoint {
    var path: String {get}
    var method: HTTPMethod {get}
}
```

There are limited number of endpoints that any API can provide. Enum will be the best way to implement `Endpoint` protocol. Let's say you have some blog platform API that provides endpoints for posts. Your endpoints enum can look like this:

```swift
public enum PostsEndpoint: Endpoint {
    
    case GetPosts
    case GetPost(Post.Id)
    case AddPost
    case UpdatePost(Post.Id)
    case DeletePost(Post.Id)
    
    public var path: String {
        switch self {
        case .GetPosts: return "posts/"
        case .GetPost(let id): return "posts/\(id)/"
        case .AddPost: return "posts/"
        case .UpdatePost(let id): return "posts/\(id)/"
        case .DeletePost(let id): return "posts/\(id)/"
        }
    }
    
    public var method: HTTPMethod {
        switch self {
        case .GetPosts, .GetPost: return .GET
        case .AddPost: return .POST
        case .UpdatePost: return .PUT
        case .DeletePost: return .DELETE
        }
    }
}
```

#### HTTP methods and headers

HTTP method can be also easily described by enum:

```swift
public enum HTTPMethod: String {
    case GET = "GET"
    case POST = "POST"
    case PUT = "PUT"
    case DELETE = "DELETE"
}
```

Different APIs can have different custom HTTP headers. Still we can define them as enum providing some standard values and ability to set custom header with arbitrary key and value.

```swift
public typealias MIMEType = String

public enum HTTPHeader {
    
    case ContentDisposition(String)
    case Accept([MIMEType])
    case ContentType(MIMEType)
    case Authorization(AccessToken)
    case Custom(String, String)
    
    var key: String {
        switch self {
        case .ContentDisposition:
            return "Content-Disposition"
        case .Accept:
            return "Accept"
        case .ContentType:
            return "Content-Type"
        case .Authorization:
            return "Authorization"
        case .Custom(let key, _):
            return key
        }
    }
    
    var requestHeaderValue: String {
        switch self {
        case .ContentDisposition(let disposition):
            return disposition
        case .Accept(let types):
            return ", ".join(types)
        case .ContentType(let type):
            return type
        case .Authorization(let token):
            return token.requestHeaderValue
        case .Custom(_, let value):
            return value
        }
    }
    
    func setRequestHeader(request: NSMutableURLRequest) {
        request.setValue(requestHeaderValue, forHTTPHeaderField: key)
    }
}
```

#### Requests and responses

Before we move to describing requests and responses we need to define some helper protocols that will help us to construct requests with arbitrary data and deserialize response data.

```swift
public protocol APIRequestDataEncodable {
    func encodeForAPIRequestData() throws -> NSData
}

public protocol APIResponseDecodable {
    init?(apiResponseData: NSData) throws
}
```

First protocol `APIRequestDataEncodable` defines function that will be used to convert arbitrary object to `NSData` for request body. `APIResponseDecodable` defines failable initializer to initialize object using response data.

Now using all these abstractions we can describe HTTP request. All we need to describe request is it's endpoint, base url (let's say you have production and development environments of your API with different domains), headers and query. Each request have different type of data that we expect in response. To abstract it we will use generic `ResultType`. Also request can be created with some input object. In this case this input object should conform to `APIRequestDataEncodable` so that we can encode it to body data without knowing any of its details. Finally we can define basic interface of request so that we can i.e. put them in array<sup>1</sup> or access its basic properties without caring about its generic type of result.

```swift
public protocol APIRequestType {
    
    var body: NSData? {get}
    var endpoint: Endpoint {get}
    var baseURL: NSURL {get}
    var headers: [HTTPHeader] {get}
    var query: [String: String] {get}
    
}

public struct APIRequestFor<ResultType: APIResponseDecodable>: APIRequestType {
    
    public let body: NSData?
    public let endpoint: Endpoint
    public let baseURL: NSURL
    public let headers: [HTTPHeader]
    public let query: [String: String]

    public init(endpoint: Endpoint, baseURL: NSURL, query: [String: String] = [:], headers: [HTTPHeader] = []) {
        self.endpoint = endpoint
        self.baseURL = baseURL
        self.query = query
        self.headers = headers
        self.body = nil
    }

    public init(endpoint: Endpoint, baseURL: NSURL, input: APIRequestDataEncodable, query: [String: String] = [:], headers: [HTTPHeader] = []) throws {
        self.endpoint = endpoint
        self.baseURL = baseURL
        self.query = query
        self.headers = headers
        self.body = try input.encodeForAPIRequestData()
    }
}
```

Response object is even simpler. Basically it should incapsulate HTTP response, it's data, error, original request and content type. We also can constrain it with generic type of its data so that `APIRequestFor` can be used only with `APIResponseOf` with the same generic result type.

```swift    
public protocol APIResponse {
    
    var httpResponse: NSHTTPURLResponse? {get}
    var data: NSData? {get}
    var error: ErrorType? {get}
    var originalRequest: NSURLRequest? {get}
    var contentType: MIMEType? {get}
    
}

public struct APIResponseOf<ResultType: APIResponseDecodable>: APIResponse {
    
    public let httpResponse: NSHTTPURLResponse?
    public let data: NSData?
    public let originalRequest: NSURLRequest?
    internal(set) public var error: ErrorType?
    internal(set) public var result: ResultType?
    
    init(request: NSURLRequest? = nil, data: NSData? = nil, httpResponse: NSURLResponse? = nil, error: ErrorType? = nil) {
        self.originalRequest = request
        self.httpResponse = httpResponse as? NSHTTPURLResponse
        self.data = data
        self.error = error
        self.result = nil
    }
}
```

#### Serialization and deserialization

Now let's define some additional classes that will serialize requests and deserialize responses.

First thing we need is to process request. Request processor will take `APIRequestType` as input and will produce `NSMutableURLRequest`.

```swift
public protocol APIRequestProcessing {
    func processRequest(request: APIRequestType) throws -> NSMutableURLRequest
}

public class DefaultAPIRequestProcessing: APIRequestProcessing {

    public var defaultHeaders: [HTTPHeader]
    
    public init(defaultHeaders: [HTTPHeader] = []) {
        self.defaultHeaders = defaultHeaders
    }
    
    public func processRequest(request: APIRequestType) throws -> NSMutableURLRequest {
        let components = NSURLComponents(string: request.endpoint.path)!
        components.queryItems = NSURLQueryItem.queryItems(request.query)
        guard let url = components.URLRelativeToURL(request.baseURL) else {
            throw NSError(code: .BadRequest)
        }
        
        let httpRequest = NSMutableURLRequest(URL: url)
        httpRequest.HTTPMethod = request.endpoint.method.rawValue
        httpRequest.HTTPBody = request.body
        for header in defaultHeaders + request.headers {
            header.setRequestHeader(httpRequest)
        }
        return httpRequest
    }

}
```

Note that input argument is not `APIRequestFor` but `APIRequestType`. While building HTTP request we don't care about type of the result, but if we would use `APIRequestFor` we would have to make processing method generic as well.

To process response data we need another class that will return complete `APIResponseOf` based on `partial` response built from data provided by `NSURLSession` callbacks.

```swift
public protocol APIResponseProcessing {
    func processResponse<ResultType>(var response: APIResponseOf<ResultType>, request: APIRequestFor<ResultType>) -> APIResponseOf<ResultType>
}

public class DefaultAPIResponseProcessing: APIResponseProcessing {

    public func processResponse<ResultType>(var response: APIResponseOf<ResultType>, request: APIRequestFor<ResultType>) -> APIResponseOf<ResultType> {
        do {
            try validate(response, request: request)
            response.result = try decode(response, request: request)
        }
        catch {
            response.error = error
        }
        return response
    }
    
    final private func validate<ResultType>(response: APIResponseOf<ResultType>, request: APIRequestFor<ResultType>) throws {
        try validateError(response, request: request)
        try validateHTTPResponse(response, request: request)
        try validateStatusCode(response, request: request)
        try validateContentType(response, request: request)
    }
    
    final private func validateError<ResultType>(response: APIResponseOf<ResultType>, request: APIRequestFor<ResultType>) throws {
        if let error = response.error {
            throw error
        }
    }
    
    final private func validateHTTPResponse<ResultType>(response: APIResponseOf<ResultType>, request: APIRequestFor<ResultType>) throws {
        if response.httpResponse == nil {
            throw NSError(code: .InvalidResponse)
        }
    }
    
    final private func validateStatusCode<ResultType>(response: APIResponseOf<ResultType>, request: APIRequestFor<ResultType>) throws {
        if let error = NSError.backendError(response.httpResponse!.statusCode, data: response.data) {
            throw error
        }
    }
    
    final private func validateContentType<ResultType>(response: APIResponseOf<ResultType>, request: APIRequestFor<ResultType>) throws {
        if let contentType = response.contentType {
            for case let .Accept(acceptable) in request.headers {
                if !acceptable.contains(contentType) {
                    throw NSError(code: .InvalidResponse)
                }
            }
        }
    }
    
    final private func decode<ResultType>(response: APIResponseOf<ResultType>, request: APIRequestFor<ResultType>) throws -> ResultType? {
        if let data = response.data {
            return try ResultType(apiResponseData: data)
        }
        return nil
    }

}

    public init() {}
    
}
```

Here we first validate partial response on errors, status code and content type and then try to create `ResultType` instance from response data using it's failable initializer. Note that here we need to use generic methods 'cause we need to provide result type for `APIResponseOf` somehow.

#### Client

Last thing we need is "API client", the object that provides API to make requests. In simplest case it can be a minimal wrapper of `NSURLSession`.

```swift
public class APIClient {
    public let baseURL: NSURL
    private let session: NSURLSession

    let requestProcessing: APIRequestProcessing
    let responseProcessing: APIResponseProcessing

    public init(baseURL: NSURL, session: NSURLSession, requestProcessing: APIRequestProcessing = DefaultAPIRequestProcessing(), responseProcessing: APIResponseProcessing = DefaultAPIResponseProcessing()) {
        self.baseURL = baseURL
        self.session = session
        self.requestProcessing = requestProcessing
        self.responseProcessing = responseProcessing
    }

    public func request<ResultType>(request: APIRequestFor<ResultType>, completion: APIResponseOf<ResultType> -> Void) -> NSURLSessionTask? {
        var task: NSURLSessionTask?
        do {
            let httpRequest = try self.requestProcessing.processRequest(request)
            task = self.session.dataTaskWithRequest(httpRequest, completionHandler: { (data, response, error) -> Void in
                self.completeRequest(task!.request, data: data, response: response, error: error, completionHandler: completion)
            })
            task.resume()
        }
        catch {
            cancelRequestWithError(error, completionHandler: completion)
        }
        return task
    }

    private func completeRequest(request: NSURLRequest!, data: NSData!, response: NSURLResponse, error: NSError!, completionHandler: APIResponseOf<ResultType> -> Void) {

        var apiResponse = APIResponseOf<ResultType>(request: task!.originalRequest, data: data, httpResponse: response, error: error)
        apiResponse = self.responseProcessing.processResponse(apiResponse, request: request)
        dispatch_async(dispatch_get_main_queue()) {
            completionHandler(apiResponse)
        }
    }

    private func cancelRequestWithError(error: ErrorType?) {
        let response = APIResponseOf<ResultType>(request: nil, data: nil, httpResponse: nil, error: error, completionHandler: APIResponseOf<ResultType> -> Void)
        dispatch_async(dispatch_get_main_queue()) {
            completionHandler(apiResponse)
        }
    }
}
```

Here `APIClient` tries to build HTTP request from `APIRequestFor` and creates `NSURLSessionTask` from it. In it's completion handler it process response data to instance of `APIResponseOf` and pass it to caller. If HTTP request fails to build caller will receive a callback with response that will contain error thrown on creating request.

To use this client you can extend it providing methods to access particular resources. For example to request posts you can create following method:

```swift
protocol PostsAPI {
    func posts(completion: APIResponseOf<Posts> -> Void) -> NSURLSessionTask?
}

extension APIClient: PostsAPI {

    public func posts(completion: APIResponseOf<Posts> -> Void) -> NSURLSessionTask? {
        let apiRequest = APIRequestFor<Posts>(endpoint: PostsEndpoint.GetPosts, baseURL: baseURL)
        return request(apiRequest, completion: completion)
    }
}
```

#### Conclusion

In this post I showed one of the ways how you can create your own network layer using Swift and it's features like generics, protocols, structs and enums. With generics there is actually no way for client to mess up with types of response data. And by separating requests and response processing to separate objects we provide clients of our code chance to change this behavior adding some additional logic.  
Of course in real life you should think twice before you decide to implement such thing as network layer yourself or use existing frameworks like Alamofire. My advice is to take advantage of open source community work and use reliable and popular frameworks in your production code. But you must understand how they work, investigate their source code. It should not be black box for you and you can even learn from it. Implementing same functionality by yourself will help you to understand how they work and probably why they were build this way and possibly how they can be improved.

You can check out source code for this posts (with some improvements for tasks management and request signing) on [Github](https://github.com/ilyapuchka/SwiftNetworking).

* * *

1. The problem is that you can not put generic types in Swift collections, cause there are also generic and require all items to have the same type defined at compile time. For instance `APIRequestFor<Posts>` and `APIRequestFor<Users>` are different types, though they both are `APIRequestFor` instances. You can not define `Array<APIRequestFor>` cause `APIRequestFor` requires it's ResultType, and you can not use `Array<APIRequestFor<AnyObject>>` or `Array<APIRequestFor<Any>>`. But you can use `Array<APIRequestType>`, though you will lose information about ResultType of each request. ↩︎
