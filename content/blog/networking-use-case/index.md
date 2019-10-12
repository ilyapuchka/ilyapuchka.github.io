---
id: 5b6f5a3a9d28c70f0f015f5f
title: Lightweight networking in Objective-C
date: 2015-08-15T19:18:00.000Z
description: "AFNetworking is the most popular networking library for iOS. Chances are high that it's the first pod you add to your Podfile. It's used as a standalone network layer and as a part of some other frameworks, like RestKit. For me it has earned it's popularity for few reasons. It's well maintained, what is very important for open source project (thought it still has long living issues). And it has well thought architecture and interface, so it is easy to use and extend to your needs."
tags: ""
---

[AFNetworking](https://github.com/AFNetworking/AFNetworking) is the most popular networking library for iOS. Chances are high that it's the first pod you add to your Podfile. It's used as a standalone network layer and as a part of some other frameworks, like [RestKit](https://github.com/RestKit/RestKit). For me it has earned it's popularity for few reasons. It's well maintained, what is very important for open source project (thought it still has long living issues). And it has well thought architecture and interface, so it is easy to use and extend to your needs.

When we perform a request using AFNetworking we can receive serialized JSON object, either dictionary or array. And we can work with it right away. But we can do better. It's much better to work not with dictionaries and arrays but our own business objects. RestKit does this job but I find it's interface quiet complex (besides that it still uses 1.x version of AFNetworking and adds it's own bugs) and never used and never will use it in my projects. So let's see how we can improve our networking code ourselves with very little effort and without using AFNetworking at all. You can download full project on [GitHub](https://github.com/ilyapuchka/LightweightNetworking-ObjC).

When we make a request it has some well known signature, like it's method, set of parameters and path. As a response to the request we expect some defined type of data. Let's create helper classes which will encapsulate requests and responses.

Here is our request:

```objective-c
typedef NS_ENUM(NSUInteger, HTTPMethod){
GET, POST, PUT, DELETE, HEAD
};

@protocol APIResponse;

@protocol APIRequest <NSObject>

- (HTTPMethod)method;
- (NSURL *)baseURL;
- (NSString *)path;
- (NSDictionary *)parameters;
- (NSDictionary *)headers;
- (Class<APIResponse>)responseClass;

@end

@protocol APIResponse <NSObject>

- (NSURLSessionDataTask *)task;
- (NSURLResponse *)response;
- (NSError *)error;
- (id)responseObject;
- (id)processedResponseObject;

- (instancetype)initWithTask:(NSURLSessionDataTask *)task
                response:(NSHTTPURLResponse *)response
            responseObject:(id)responseObject
                    error:(NSError *)error;

- (id)processResponseObject:(NSError **)error;

@end
```

We can add now some basic implementation of these protocols, i.e. to represent request for data in JSON format:


```objective-c
@interface SimpleAPIRequest : NSObject <APIRequest>

@end

@interface JSONAPIRequest : SimpleAPIRequest

@end

@interface SimpleAPIRequest()

@property (nonatomic) HTTPMethod method;
@property (nonatomic, copy) NSString *path;
@property (nonatomic, copy) NSDictionary *parameters;
@property (nonatomic, copy) NSDictionary *headers;
@property (nonatomic) Class<APIResponse> responseClass;

@end

@implementation SimpleAPIRequest

- (instancetype)init
{
    self = [super init];
    if (self) {
        self.responseClass = [SimpleAPIResponse class];
    }
    return self;
}

@end

@implementation JSONAPIRequest

- (instancetype)init
{
    self = [super init];
    if (self) {
        self.responseClass = [JSONAPIResponse class];
        self.headers = @{@"Accept": @"application/json", @"Content-type": @"application/json"};
    }
    return self;
}

@end

@interface SimpleAPIResponse: NSObject <APIResponse>

@end

@interface JSONAPIResponse : SimpleAPIResponse

@end

@interface SimpleAPIResponse ()

@property (nonatomic, copy) NSURLSessionDataTask *task;
@property (nonatomic, copy) NSHTTPURLResponse *response;
@property (nonatomic, copy) NSError *error;
@property (nonatomic, strong) id responseObject;
@property (nonatomic, strong) id processedResponseObject;

@end

@implementation SimpleAPIResponse

- (instancetype)initWithTask:(NSURLSessionDataTask *)task response:(NSHTTPURLResponse *)response responseObject:(id)responseObject error:(NSError *)error;
{
    self = [super init];
    if (self) {
        self.task = task;
        self.response = response;
        self.error = error;
        self.responseObject = responseObject;
        
        if (!error) {
            NSError *serializationError;
            self.processedResponseObject = [self processResponseObject:&serializationError];
            if (serializationError) {
                self.error = serializationError;
            }
        }
    }
    return self;
}

- (id)processResponseObject:(NSError *__autoreleasing *)error
{
    return self.responseObject;
}

@end

@implementation JSONAPIResponse

- (id)processResponseObject:(NSError *__autoreleasing *)error
{
    if ([self.responseObject isKindOfClass:[NSData class]]) {
        NSError *serializationError;
        id processedResponseObject = [NSJSONSerialization JSONObjectWithData:self.responseObject options:0 error:&serializationError];
        if (error) *error = serializationError;
        return processedResponseObject;
    }
    else {
        return nil;
    }
}

@end
```

To make requests we need some object. It will make request using `NSURLSessionTask`. Let's define it's protocol.

```objective-c
typedef void(^APIClientCompletionBlock)(id<APIResponse> response);

@protocol APIClient <NSObject>

- (NSURLSessionDataTask *)dataTaskWithAPIRequest:(id<APIRequest>)request
                                        completion:(APIClientCompletionBlock)completion;

@end
```

Foundation already has class that can create `NSURLSessionTask` - `NSURLSession`. So let's extend it and implement `APIClient` protocol in it's category:

```objective-c
@interface NSURLSession(APIClient) <APIClient>

@end

@implementation NSURLSession(APIClient)

- (NSURLSessionDataTask *)dataTaskWithAPIRequest:(id<APIRequest>)request
                                        completion:(APIClientCompletionBlock)completion;
{
    NSURL *requestUrl = [NSURL urlWithString:request.path baseURL:request.baseURL parameters:request.parameters];
    NSURLRequest *httpRequest = [NSURLRequest requestWithMethod:request.method url:requestUrl headers:request.headers];
    __block NSURLSessionDataTask *task;
    task = [self dataTaskWithRequest:httpRequest completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        
        Class responseClass = [request responseClass];
        id<APIResponse> apiResponse = [[responseClass alloc] initWithTask:task response:(NSHTTPURLResponse *)response responseObject:data error:error];
        
        dispatch_async(dispatch_get_main_queue(), ^{
            if (completion) { completion(apiResponse); }
        });
    }];

    [task resume];
    return task;
}

@end
```

This implementation is very generic. In callbacks we can receive instance of `APIResponse` protocol or some specific class that request instance returns from `+responseClass` method. By methods that provide specific type of response we can give clients of our code some type safety.

Now lets look how we can use that. Lets say we have some API that returns GitHub users. Lets define users request and response:

```objective-c    
@interface GitHubJSONRequest : JSONAPIRequest

@end

@implementation GitHubJSONRequest

- (NSURL *)baseURL
{
    return [NSURL URLWithString:@"https://api.github.com"];
}

@end


@interface UsersRequest : GitHubJSONAPIRequest

@end

@implementation UsersRequest

- (HTTPMethod)method
{
    return GET;
}

- (NSString *)path
{
    return @"users";
}

- (Class)responseClass
{
    return [UsersResponse class];
}

@end


@interface UsersResponse : JSONAPIResponse

@property (nonatomic, strong, readonly) NSArray *users;

@end

@implementation UsersResponse

- (BOOL)processResponseObject:(NSError **)error;
{
    NSError *__error;
    id processedResponseObject = [super processResponseObject:&__error];
    if (__error || ![processedResponseObject isKindOfClass:[NSArray class]]) {
        if (error) *error = __error;
        return nil;
    }
    else {
        return [User withArray:processedResponseObject];
    }
}

- (NSArray *)users
{
    return self.processedResponseObject;
}

@end
```

Defining shorthand methods to access processed response objects (like `- (NSArray *)users`) will give our clients a straight way to access data they need and provide information about type of this data so they will not need to guess the type and cast it.

What about api client? We don't need to subclass it, we can use it's category to add behavior that we need:

```objective-c
typedef void(^UsersResponseBlock)(UsersResponse *response);

@protocol GitHubClient <APIClient>

- (NSURLSessionDataTask *)getUsers:(UsersResponseBlock)completion;

@end

@interface APIClient (GitHub) <GitHubClient>

@end

@implementation APIClient (GitHub)

- (NSURLSessionDataTask *)getUsers:(UsersResponseBlock)completion;
{
    UsersRequest *request = [[UsersRequest alloc] init];
    NSURLSessionDataTask *task = [self dataTaskWithAPIRequest:request completion:completion];
    [task resume];
    return task;
}

@end
```

First we create a request. Then we call the method of `APIClient` that actually perform request.  
Adding `-getUsers:...` method will make a client of our code to be sure about what kind of response it will get - without any typecasting at all.

And that's all.

#### Conclusion

Let's look what we have achieved using this approach:

1. All of our requests and responses are encapsulated in small classes that are easy to read and test. When our api changes we will change only request or response class and will not need to change our api client or any other object.
2. Mapping to business objects is made at the moment when response object is created and it's done in generic way. All we need is to override template method in response class. It is also easy to test.
3. Type safety. Clients of our code should explicitly define relationships between requests and responses. Our code then guarantees that it will provide client with the right objects. Of course it's not real type safety comparing with Swift but at least we will have proper code completion and will get rid of typecasts.
4. We didn't use AFNetworking at all. So you can see how easy it is to manage networking yourself. AFNetworking of course provides much more functionality, but using described approach you can extend not just `NSURLSession`, but also `AFHTTPSessionManager` and make it more convenient to use.

