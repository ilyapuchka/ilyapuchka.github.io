---
id: 5b6f5a3a9d28c70f0f015f88
title: Codable in practice
date: 2018-05-05T23:38:46.000Z
description: ""
tags: ""
---

One of the first tasks I got in my new team was to convert entire code base from in-house JSON encoding/decoding solution (in fact two of them) to Swift native Codable protocols. What may sound like an easy task, on practice means a lot of work taking into account inconsistencies in API. That lead to the situation when apart from really simple data structures holding just few properties of primitive types, everything required custom decoding or encoding. Here are few of the use cases that I encountered and their possible solutions. In the end I will talk a bit about my experience using Sourcery to solve these issues.

<!-- description -->

#### Single or few keys differ from its property name.

When it is not a problem at all when you are dealing with small types, this requires a lot of manual typing when you have dozen of properties, because one "bad" key will require you to define all the other keys as well. Trivial example of that is `id` property. In the code it may be named `identifier`, but in most APIs it is `id`. One way to solve that would be of course to rename all `identifiers`'s to `id`'s, but that will lead to a lot of unnecessary changes in entire codebase (even if automated with refactoring tools) and may go against team coding style and lint rules. With Swift 4.1 this can be solved with custom key [decoding](https://developer.apple.com/documentation/foundation/jsondecoder.keydecodingstrategy)/[encoding](https://developer.apple.com/documentation/foundation/jsonencoder.keyencodingstrategy) strategies, but it can be costly performance wise, as noted in the docs (though I personally haven't made any performance tests). Also it may happen that single key decoding strategy will not cover all your cases.

Another common problem with coding keys is when APIs uses snake case notation while client code uses camel case. This seems to me as a pretty standard case, so that with Swift 4.1 it is one of the built in keys decoding/encoding strategies (apart from default one). While covering most of the cases this strategy will not cover all of them though. One trivial example of that is acronyms. To decode key like `base_url` you'll need to name corresponding property as `baseUrl`, when `baseURL` is more canonical. In case if you want to keep property name as `baseURL` you will need to define a custom key for it, which will bring you the the previous problem. Another issue may be in minor differences in encoding compound words, like `post_code` vs `postcode`, `first_name` vs `firstname` and so on. People also make mistakes quite often and as a result you can be stuck with using keys with typos and other inconsistencies in API which most of the time is easier to work around on clients than on backend.

So even if you are using key strategies, you may still need to define your coding keys, even though now not all of them will need to have a raw value, but apparently this still does [not work very well](https://forums.swift.org/t/keydecodingstrategy-and-keys-with-custom-raw-values/12392).

Another less common but still possible case is when you deal at the same time with different APIs which use different keys strategies. Using standard library's approach will make you to handle these APIs differently to be able to set different strategies on decoders that they use, which can require you make more changes to your network layer implementation.

#### Single or few properties require custom decoding/encoding.

In case you only need to transform some keys and all is fine with your data types, i.e. numbers always come as numbers and not as strings, having custom `CodingKeys` may be just enough for you. But if you have at least one property that you have to decode or encode manually you will have to do that for all the properties. And even if all is fine with your keys and you only need custom decoding, you will have to define all the keys too as complier will not let you to use decoder with keys type which is not defined anywhere\*. Meaning that automatic synthesis of Codable implementation is useless in this case and you can end up with twice as much code to write as number of properties in your type.

> \* This will not be the case if you let compiler to generate implementation for one of `Decodable` or `Encodable` protocols when you are conforming to `Codable`. But if you provide manually implementation for both of them or when you conform only to one of them and provide manual implementation for it - compiler will not generate CodingKeys type for you.

The best way to make it still work is to introduce intermediate wrapper types which will handle this custom decoding/decoding implementations. This though can cause unexpected changes across your code base and can make working with your models harder when you need to access these wrapped values. To mitigate the negative effect of this your can introduce computed properties which will take care of unwrapping, but you'll need a different name for such properties, so the problem of unneeded changes does not go away. You can instead change the name of a wrapper property, i.e. prefix it with underscore, and use a custom key strategy which will drop it for all the keys.

#### Ignoring malformed data

It might be the case that some of the data will come in a format that you don't expect and can not decode, i.e. date format changed without API version change, or you are dealing with user generated data that was not validated. In case this data is a part of a bigger data graph you probably don't want to fail decoding of the whole graph just because something went wrong with one of its portions, but instead disable some corresponding feature of the app. This may be controlled by the API not returning such data so you will not need to decode corresponding keys (but most likely API will not care about validating data for a client). In this case you can just make your property optional or use `decodeIfPresent` if you have to do decoding manually. The problem with this is that if at some point you will receive malformed data, decoding will still fail, because as you can see from `Decodable` constructor signature `init(from:) throws` it is not failable and only can throw errors, which will be then re-thrown by `decodeIfPresent`. So if key is present, decoder will still attempt to decode what ever data is stored by this key. Instead of optionals and `decodeIfPresent` we have to use either custom decoding methods which will silence errors:

    extension KeyedDecodingContainer {
        public func decodeSafely<T: Decodable>(_ type: T.Type, forKey key: KeyedDecodingContainer.Key) -> T? {
            guard let decoded = try? decode(T.self, forKey: key) else { return nil }
            return decoded
        }
    
        public func decodeSafelyIfPresent<T: Decodable>(_ type: T.Type, forKey key: KeyedDecodingContainer.Key) -> T? {
            guard let decoded = try? decodeIfPresent(T.self, forKey: key) else { return nil }
            return decoded
        }
    }

or introduce a wrapper type that will do the same in its implementation of `Decodable` constructor:

    struct FailableDecodable<T: Swift.Decodable>: Swift.Decodable {
            let value: T?
    
            init(from decoder: Swift.Decoder) throws {
                let container = try decoder.singleValueContainer()
                self.value = try? container.decode(T.self)
            }
    }

The benefit of using wrapper type is that it can be then used as a property type by itself to allow decoding code to be synthesised by compiler and can be used as a type of collection elements, like arrays, as discussed further.

#### Prune arrays

Malformed data discussed previously can come in as an array. In this case you might want to just filter out those items which can not be decoded and keep the rest. Again standard decoding methods will not work here as decoding `[T].self` type will fail if any of items can not be decoded to `T`, as well as `[T?].self` - even though `Optional` is `Decodable` its implementation rethrows the error if its value can't be decoded. In this case you can again use `FailableDecodable` wrapper or extend decoder with custom decoding methods:

    items = try values.decode([FailableDecodable<Item>].self, forKey: .items).flatMap({ $0.value })
    
    items = try values.decodeIfPresent([FailableDecodable<Item>].self, forKey: .items).flatMap({ $0.value })

#### Not empty arrays and strings

In constrast to pruning arrays you might want to ensure that array contains at least one item, or string to be not empty. This type of validation could be performed on a backend side but usually it's not the case. So you will have to deal with it on a client. Another wrapper that ensures that wrapped collection (including `String`) is not empty can be useful in this case (you can implement more [sophisticated](https://github.com/khanlou/NonEmptyArray) version of it). Again you can use this wrapper directly or introduce custom decoding methods (you might then need them on both `KeyedDecodingContainer` and `UnkeyedDecodingContainer`).

    struct NotEmptyDecodable<T: Swift.Decodable & Collection>: Swift.Decodable {
        var value: T
    
        init(from decoder: Decoder) throws {
            let values = try decoder.singleValueContainer()
            let value = try values.decode(T.self)
            guard !value.isEmpty else {
                throw decoder.dataCorrupted("Unexpected empty \(T.self)")
            }
            self.value = value
        }
    
    }

#### Deep nesting

It is not unusual to have data that you are interested in buried deep inside data structure. This can be just one key, i.e. when you want to decode or encode array of some items by `items` key, or it can be a complex key path like `errors.base.0`. To access it this way you can replicate data structure by defining all intermediate types and keys. But if you will never use them for anything else it seems like too much of an effort just to make automatic synthesis work, especially if you have to do that in several places. You probably don't want to bloat your data models with bunch of "lists" and other dummy types which do not have any other practical application (though sometimes it can be a useful abstraction and a really good and fast way to solve this issue). Instead you can perform decoding using something similar to key path access using yet another smart wrapper.

First we will need a custom key type:

    public struct AnyCodingKey: Swift.CodingKey, ExpressibleByStringLiteral, ExpressibleByIntegerLiteral {
        public var intValue: Int?
        public var stringValue: String
    
        public init?(intValue: Int) {
            self.intValue = intValue
            self.stringValue = "\(intValue)"
        }
    
        public init?(stringValue: String) {
            self.stringValue = stringValue
            self.intValue = Int(stringValue)
        }
    
        public init(stringLiteral value: String) {
            self.init(stringValue: value)!
        }
    
        public init(integerLiteral value: Int) {
            self.init(intValue: value)!
        }
    
    }

This key can be constructed with any string to access property by key or integer to access item in array by index (most of the time you will probably need just first or last item, so recognising `first` and `last` in the key path can be handy too). Next we need a method that will take care of decoding by key path:

    struct NestedKeyDecodable<T: Swift.Decodable>: Swift.Decodable {
        let value: T
     
        init(from decoder: Swift.Decoder) throws {
            guard let nestedKey = decoder.userInfo[AnyCodingKey.key] as? AnyCodingKey,
                  !nestedKey.stringValue.isEmpty else {
                fatalError("No key is stored in decoder's user info")
            }
            let keydContainer = try? decoder.container(keyedBy: AnyCodingKey.self)
            let unkeyedContainer = try? decoder.unkeyedContainer()
            self.value = try _decodeNested(key: nestedKey,              
                                keyedContainer: keydContainer,
                              unkeyedContainer: unkeyedContainer)
        }
    }

The main bit of implementation is `_decodeNested` function. What it does is it breaks key path into keys using `.` as a separator and loops through key path items trying to get either nested keyed container for string items (accessing nested object) or nested unkeyed container for integer items (accessing array element). On the last key path item it tries to decode value from the latest nested container it had reached.

    func _decodeNested<T: Swift.Decodable>(key: AnyCodingKey,
                                                   keyedContainer: KeyedDecodingContainer<AnyCodingKey>?,
                                                   unkeyedContainer: UnkeyedDecodingContainer?) throws -> T
    {
        var keyPath = key.stringValue.components(separatedBy: ".")
        var key = AnyCodingKey(stringValue: keyPath.removeFirst())!
        var keyedContainer = keyedContainer
        var unkeyedContainer = unkeyedContainer
    
        if let index = key.intValue {
            try unkeyedContainer?.advance(to: index)
        }
    
        while !keyPath.isEmpty {
            let nextKey = AnyCodingKey(stringValue: keyPath.removeFirst())!
            if let index = nextKey.intValue {
                unkeyedContainer = try keyedContainer?.nestedUnkeyedContainer(forKey: key, at: index)
                    ?? unkeyedContainer?.nestedUnkeyedContainer(at: index)
                keyedContainer = nil
            } else {
                keyedContainer = try keyedContainer?.nestedContainer(keyedBy: AnyCodingKey.self, forKey: key)
                    ?? unkeyedContainer?.nestedContainer(keyedBy: AnyCodingKey.self)
                unkeyedContainer = nil
            }
            key = nextKey
        }
    
        if let c = keyedContainer {
            return try c.decode(T.self, forKey: key)
        } else if var c = unkeyedContainer {
            return try c.decode(T.self)
        } else {
            fatalError("Should never happen")
        }
    }

#### Flat data structure

Opposite to the nested data is situation when you have different data types encoded in the same JSON object. For example it can be a patient data with their address encoded on the same level as its name and other personal details instead of being a separate object stored by its own key. In your data model you can prefer to represent it as a single property of `Address` type, especially if another endpoint returns you this type on its own and you want to reuse it. To do that call `Decodable` constructor of this type and pass it the same decoder used to decode the containing type. The same applies to encoding.

    struct Person: Decodable {
        let name: String
        let address: Address
    
        enum CodingKeys: String, CodingKey { ... }
    
        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            name = try container.decode(String.self, forKey: .name)
            address = try Address(from: decoder)
        }
    }

#### Mapping from one type to another

It's very usual when you need to convert `String`s to `Double`, or `String` to some enum value. `JSONDecoder.nonConformingFloatDecodingStrategy` only takes care of converting "exceptional" float values, like infinity or `NaN` and does not provide extension mechanism like custom keys strategy, so will not help here. It can be solved with a computed property, but it might be better to perform mapping during decoding so that decoding fails if mapping fails, instead of returning optional in the computed property. I.e. if you need to map `String` to `Double` you may use custom decoding methods, like `func decode(_ type: String.Type, forKey key: Key) -> Double`, or generic wrappers, i.e. `StringNumber<T>` which will implement `Decodable` only if `T` is of `Double` or `Int` type (thanks to conditional conformance!).

#### Different date formats

In ideal world API is consistent in representing dates as well as other types. In this ideal world it either uses ISO format or timestamps, so that you can use one of the decoding strategies provided by standard library, or at least uses some consistent format, so that you can define your own strategy based on `DateFormatter`. But in real world you can have an endpoint that, lets say, returns appointment details with the date and time of appointment and patient personal data with its birthday which only have date and does not have time. One decoding strategy will not be able to handle this. You may come up with a smart custom strategy that takes in `Decoder` and returns `Date` depending on the key being decoded (`Decoder` does not keep track of the type being decoded, it only tracks keys), but it does not sound like a good solution to me. One alternative is to decode each date property as a string value first and then use what ever date formatter you need in each particular case. Another is to introducing generic type that will be parametrised over formatter type:

    
    struct FormattedDate<F: DateFormatter>: Decodable {
        let date: Date
    
        init(from decoder: Decoder) throws {
            let values = try decoder.singleValueContainer()
            let dateString = try values.decode(String.self)
            let dateFormatter = F.sharedInstance // 🤷‍♂️
            guard let date = dateFormatter.date(from: dateString) else {
                throw DecodingError.dataCorrupted("Invalid date format")
            }
            self.date = date
        }
    }

This though will require to define date formatters as subclasses of `DateFormatter` (you can model it in another way but you will still need them to be distinct types), while it's more common to define them as plane `DataFormatter`s created with different date formats and stored as a static instances in some namespace.

#### Dictionaries and arrays of arbitrary types

Not always data have a well defined scheme that you can control, sometimes you need to decode or encode `[Any]` or `[String: Any]` types. These types can not be decoded or encoded automatically as `Any` is not "codable" (even worse in Swift 4 code that does that will compile but will crash at runtime). These types can be decoded/encoded using a wrapper that will internally check decodable or encodable value against each possible type and decode/encode it accordingly (also taking care of `null` values with `decodeNil(forKey:)` method). Its implementation is trivial and consists of quite a few `if/else` statements, so I'll leave it out as an exercise.

#### Optional values as required

By default optional values will be decoded using `decodeIfPresent` method and will not be encoded if the value is `nil`. It might be not what you want as it can mask errors on API side (when it does not return key that you are expecting) or API can require you to send all the values in a payload even if they are `null`. At the same time you might need to use optional property because you need to create an instance of a type manually and in this case don't have values for these properties. A good example of such properties (for decoding case) can be unique id's generated by the API. The only feasible option here is to implement coding methods manually for type with such properties.

#### Default values

Another case that standard library does not take care of is default values. When you can't decode, let's say, `Int` value, `0` can be a valid default for it. You probably wouldn't want to deal with optionality in every place where you use this property, so you either will need to implement coding methods manually, falling back to default value, or make this property optional and use another computed property that will fall back to default value. If you need to encode default value too, computed property will not work as only stored properties are encoded by default so you will still need to implement encoding manually.

#### Memberwise initialiser

This issue is not related to problems with decoding particular data types but instead is a limitation of Swift as a language. When you implement `Decodable` on a struct and define its `init(from decoder: Decoder)` method in its body, Swift will not generate memberwise initialiser for such struct. This is mostly a problem for unit tests when you need to create fake values. To avoid this issue define `init(from decoder: Decoder)` in an extension of your struct.

These issues are most of which I had to tackle, but there are also other interesting use cases which I luckily didn't have to deal with, like [decoding subclasses, inherited classes, heterogeneous arrays](https://medium.com/tsengineering/swift-4-0-codable-decoding-subclasses-inherited-classes-heterogeneous-arrays-ee3e180eb556) and there are some more very [useful tips](http://kean.github.io/post/codable-tips-and-tricks) on this topic, some of which I used during development.

If we look at the outlined solutions they all more or less fall into three domains:

- 

implementing decoding/encoding manually and dealing with issues one by one

- 

extending decoding/encoding containers with custom methods

- 

define wrapper types and use type system to make Codable implementation synthesised by compiler

The first option is the most straight forward but can require you to write or copy-paste a lot of code.  
The second option will still require manual implementation of decoding/encoding protocols but will give you reusable methods which will save you some time.  
With the third option instead of reusable methods you will have types and will be able to make code synthesised for you in more cases, but it may require you to make more unneeded changes in your code base and make it harder to work with your types. It also has another positive effect - it makes a data scheme to be encoded in your types, which I think is better than using decoding strategies provided by standard library. It can be a good idea though to have separate types for those data schemes and for data models and setup bridging between them so that data models are agnostic about API details. But that leads to more boilerplate code to write.

#### Sourcery

But there is also another option - let Sourcery to [generate boilerplate `Codable` code](https://cdn.rawgit.com/krzysztofzablocki/Sourcery/master/docs/codable.html) instead of compiler. There are few benefits of using Sourcery here comparing with other options:

- 

it is much more flexible than what standard library has to offer right now, you can implement absolutely custom template which will handle your specific cases in the way which suits best to you

- 

it saves you from writing much more boilerplate code than standard library can do right now. It can let you to define only custom coding keys and generate the rest of the keys for you, and it can let you to define custom decoding methods only for some properties and generate code for the rest of the properties

- 

you don't need to pollute your code with various wrapper types which only purpose is to satisfy compiler

- 

Sourcery will update generated code whenever you change your source code so you will never forget to decode or encode new property

- 

you can remove Sourcery at any point and you will have all the code in place already

There are drawbacks of course too:

- 

learning curve as you need to understand Sourcery specifics and its limitations

- 

you may need to develop and maintain your own template or extend existing one, so you'll need to be comfortable with options that Sourcery provides for developing templates (Stencil, Swift or EJS)

- 

if you are working in the team you need to make sure that you are not the only one who understand what Sourcery is. Otherwise you will end up with it being removed as soon as you leave the team (the story of my life) or it will be harder to adopt it

- 

template code is still a code and it can have bugs and can (will) become a legacy. Also do not overuse annotations - they make templates more flexible, but, in my experience, are hard to understand for newcomers

#### Conclusion

`Codable` as a feature was by now well accepted by community and made life of Swift developers much easier, but it still does not solve all the issues we have to deal with in real-life projects. There are multiple ways how you can solve them by writing your code in a specific ways. And tools like Sourcery which will help you to write even less code.
