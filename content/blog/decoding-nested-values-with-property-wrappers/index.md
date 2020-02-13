---
title: Decoding nested values with property wrappers
date: 2020-02-13
description: "Property wrappers is one of the recent Swift proposals that have been welcomed probably the most by the community. Let's see how property wrappers can be used to solve one decoding edge case as an example - decoding deeply nested values."
tags: Swift
---
 
Property wrappers is one of the recent Swift proposals that have been welcomed probably the most by the community. To be fair though they don't bring anything relly revolutionary to the way we write code. For instance in the context of decoding we could use wrapper types from day one. The main difference that property wrappers make (let's forget about their projected value feature) in this context and which makes using them much more attractive is ability to refer to a wrapped value as it was not wrapped. But that makes all the difference. So let's see how property wrappers can be used to solve one decoding edge case as an example - decoding deeply nested values.

## The problem

It's common that when decoding some type we want to get access to some value deep down the chain of nested objects. The most trivial approach to do that would be to declare all the intermediate types and properties so that compiler can generate all the code for us. But we, developers, are lazy and don't like to write boilerplate code that we won't use otherwise. Also this approach means that we would need to access these nested values through a long chain of properties, or we would need to write even more boilerplate to incapsulate that.

Wouldn't be nice if we could decode nested values without all these intermediate types and properties baggage? It turns out we can do that and it is pretty easy to do without even fighting the standard library (almost).

## Decoding a single nested value

Let's say we have a JSON of the following format:

```
{
    "id": "1",
    "user": {
        "details": {
            "address": "Apple St."
        }
    }
}
```

And we want to decode it into the following struct:

```swift
struct Contact: Decodable {
    let id: String
    let address: String
}
```

Out of the box compiler won't generate the code that would be able to decode such JSON in this struct as it does not know about intermediate `"user"` and `"details"` keys. Without declaring all the intermediate data structures we would need to implement decoding manually like this:

```swift
enum CodingKeys: String, CodingKey {
    case id
    case user
    case details
    case address
}
    
init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    
    self.id = try values.decode(String.self, forKey: .id)
    self.address = try values
        .nestedContainer(keyedBy: CodingKeys.self, forKey: .user)
        .nestedContainer(keyedBy: CodingKeys.self, forKey: .details)
        .decode(String.self, forKey: .address)
}
```

As you see we not only have to implement all the decoding code but also define all the coding keys ourselves. It's not a hard thing to do but can be a lot of typing. Ideally we don't want to implement decoding and to define all the coding keys manually.

To start let's highlight what's missing for the compiler to generate this code for us. First thing that is missing is intermediate coding keys. Compiler generates coding keys based on the stored properties of our type, so in our case it will generate `id` and `address` keys, but `details` and `user` keys will be missing.

Next thing that is missing is a link between the `address` property and its key path in the JSON structure. Compiler does not know that to extract `address` value it needs to go through `user` and `details` objects first. If we will be able to provide this link to the compiler somehow then we will be able to remove our custom decoding constructor and just rely on compiler generated code.

So what we need to do now is to somehow abstract this code:

```swift
self.address = try values
    .nestedContainer(keyedBy: CodingKeys.self, forKey: .user)
    .nestedContainer(keyedBy: CodingKeys.self, forKey: .details)
    .decode(String.self, forKey: .address)
```

To do that we need to know the order of the keys and their values. In this case the order is `.user`, `.details`, `.address`. Then we need to know the type of the property we are decoding, which is a `String`.

When compiler generates decoding code for us it generates calls to the methods of `KeyedDecodingContainer` which all look like `func decode<T>(_: T.Type, forKey key: Key) throws -> T`. To decode `address` property compiler will generate a call to `decode(String.self, forKey: .address)`. So there seem to be no direct way for us to inject the missing keys. And here comes the wrapper.

To hold the intermediate keys that compiler needs to use to generate code we can define a special wrapper type, let's call it `NestedDecodable`:

```swift
struct NestedDecodable<T: Decodable>: Decodable {
    let wrappedValue: T
    let keys: [CodingKey]
}
```

Now we can declare our address property as wrapped in this type:

```swift
let address = NestedDecodable<String>(
    keys: [
        CodingKeys.user, 
        CodingKeys.details, 
        CodingKeys.address
    ]
)
```

This though won't work as this property will be initialised even before invoking a decoder and we don't have wrapped value to pass to it. So instead we can only declare its type as wrapped into `NestedDecodable`:

```swift
let address = NestedDecodable<String>
```

But now we don't have a way to specify the keys... We will make it right later but for now let's leave it as it is and move on to the decoding container.

With the code we have so far compiler will generate the code that will try to decode address with `decode(NestedDecodable<String>.self, forKey: .address)`. As `NestedDecodable` and it's wrapped value are as well decodable types then compiler will generate decoding initialiser for it as well, which will try to decode its wrapped value and coding keys. But both of these properties are not present in the JSON so we can't rely on compiler generated code as it is now.

Instead we can define a specialised decoding function on `KeyedDecodingContainer` that would decode values of this type with an extension:

```swift
extension KeyedDecodingContainer {
    func decode<T>(_: NestedDecodable<T>.Type, forKey key: Key) throws -> NestedDecodable<T> {
        ...
    }
}
```

Here we would want to decode the value and return it wrapped into the `NestedDecodable`.

```swift
extension KeyedDecodingContainer {
    func decode<T>(_: NestedDecodable<T>.Type, forKey key: Key) throws -> NestedDecodable<T> {
        let wrappedValue = ...
        return NestedDecodable(wrappedValue: wrappedValue)
    }
}
```

For that we would need to adjust a constructor of `NestedDecodable` to accept wrapped value:

```swift
struct NestedDecodable<T>: Decodable {
    let wrappedValue: T
    init(wrappedValue: T) {
        self.wrappedValue = wrappedValue
    }
}
```

But now we don't really have a place where to store the nested keys values. As a matter of fact we don't really need them to be stored in `NestedDecodable` any more as we would need to use them before we even create an instance of `NestedDecodable`. But without this instance the only thing we have is the type `NestedDecodable<T>.Type`. 

How can we get the list of nested keys when we have only information about types? Remember that coding keys are enums (technically it's not a requirement). How knowing an enum type can we get a list of enum values? Sounds familiar? Right, it's `CaseIterable`:

```swift
enum CodingKeys: String, CodingKey, CaseIterable {
    case id
    case user
    case details
    case address
}

CodingKeys.allCases == [.id, .user, .details, .address]
```

Almost what we need, except we have all the keys here, but when decoding `address` we need only `user`, `details` and `address`. Also we need to have these keys exactly in this order as this is the order we would need to go through the JSON. We still need to have `id` key for `id` property, so let's define a separate type for address keys:

```swift
struct Contact {
    ....
    
    enum CodingKeys: String, CodingKey {
        case id
    }
    
    enum AddressCodingKeys: String, CodingKey, CaseIterable {
        case user, details, address
    }
}

AddressCodingKeys.allCases == [.user, .details, .address]
```

Great! Now we need to make our `NestedDecodable` type aware about these extra coding keys type, which we can do by adding another generic parameter to it:

```swift
struct NestedDecodable<T, Keys: CodingKey & CaseIterable>: Decodable {
    ...
}

struct Contact: Decodable {
    let id: String
    let address: NestedDecodable<String, AddressCodingKeys>
    
    enum CodingKeys: String, CodingKey {
        case id
    }
    
    enum AddressCodingKeys: String, CodingKey, CaseIterable {
        case user, details, address
    }
}
```

With that we need to update the signature of our `KeyedDecodingContainer` extension and we can finally access nested coding keys:

```swift
extension KeyedDecodingContainer {
    func decode<T, NestedKeys>(_: NestedDecodable<T, NestedKeys>.Type, forKey key: Key) throws -> NestedDecodable<T, NestedKeys> {
        let keys = NestedKeys.allCases
        let wrappedValue = ...
        return NestedDecodable(wrappedValue: wrappedValue)
    }
}
```

Now we have everything to start to decode our values. First we would need to get hold of the nested container for `user` key, then its nested container for `details` key and finally we would be able to decode the `address` value. As this is a generic method we don't really know how many nested keys we will have and what will be their actual values, so our method should be generic enough to be able to decode any value with any number of nested keys. For that we will simply iterate over the list of keys and get a nested container for each of the key until we rich the last one which we will use to finally decode the value:

```swift
var container: KeydDecodingContainer<NestedKeys>
NestedKeys.allCases.dropLast().forEach { key in
    container = try container.nestedContainer(keyedBy: NestedKeys.self, forKey: key)
}
let wrappedValue = try container.decode(T.self, forKey: NestedKeys.lastCase!)
return NestedDecodable(wrappedValue: wrappedValue)
```

Unfortunatelly this won't work because when we get the nested container for the first key we don't have a `container` instance initialised to call `nestedContainer` on. We only have `self` which is a container itself, but it has a different type `KeyedDecodingContainer<Key>` as `Key` and `NestedKeys` are different types. So if we will try to use `self` as initial value `var container: KeyedDecodingContainer<NestedKeys> = self` the types will mismatch. But as soon as we have a first nested container we will always have `KeyedDecodingContainer<NestedKeys>` down the way. Seems like we need to handle the first key separately. So let's do that:

```swift
var container = try self.nestedContainer(keyedBy: NestedKeys.self, forKey: NestedKeys.allCases.first!)
NestedKeys.allCases.dropFirst().dropLast().forEach { key in
    container = try container.nestedContainer(keyedBy: NestedKeys.self, forKey: key)
}
let wrappedValue = try container.decode(String.self, forKey: NestedKeys.lastCase!)
return NestedDecodable(wrappedValue: wrappedValue)
```

This still won't compile though - to call `self.nestedContainer` we need to pass it a key value that is of container's key type, in this case it's `Key` (at runtime it will be `Contact.CodingKeys`), but `NestedKeys.allCases.first` is a `NestedKey`...

There is also another problem that right now we only have an `id` key defined in the `Contact.CodingKeys`. So compiler will complain that a key for `address` property is missing. Let's add it then. 

```swift
enum CodingKeys: String, CodingKey {
    case id
    case address
}
```

Now compiler will call our extension `decode` method with the `address` key and we can use it instead of the `NestedKeys.allCases.first` to get the first nested container. But we need to make sure we set the raw value of this key to the actual root key, which is `"user"` in our case. With that we won't need `user` key in `Contact.AddressCodingKeys` any more:

```swift
enum CodingKeys: String, CodingKey {
    case id
    case address = "user"
}

enum AddressCodingKeys: String, CodingKey, CaseIterable {
    case details, address
}

extension KeyedDecodingContainer {
    func decode<T, NestedKeys>(_: NestedDecodable<T, NestedKeys>.Type, forKey key: Key) throws -> NestedDecodable<T, NestedKeys> {
        var container = try self.nestedContainer(keyedBy: NestedKeys.self, forKey: key)
        NestedKeys.allCases.dropLast().forEach { key in
            container = try container.nestedContainer(keyedBy: NestedKeys.self, forKey: key)
        }
        let wrappedValue = try container.decode(String.self, forKey: NestedKeys.lastCase!)
        return NestedDecodable(wrappedValue: wrappedValue)
    }
}
```

This will finally compile and actually work in runtime! It looks a bit weird that we have two `address` keys but one of them is actually a `"user"` key, but that's the way to make compiler happy.

Let's sum up all the code we have right now to see that it's actually not that much:

```swift
struct Contact: Decodable {
    let id: String
    let address: NestedDecodable<String, AddressCodingKeys>
    
    enum CodingKeys: String, CodingKey {
        case id
        case address = "user"
    }
    
    enum AddressCodingKeys: String, CodingKey, CaseIterable {
        case details, address
    }
}

struct NestedDecodable<T, Keys: CodingKey & CaseIterable>: Decodable {
    let wrappedValue: T
    init(wrappedValue: T) {
        self.wrappedValue = wrappedValue
    }
}

extension KeyedDecodingContainer {
    func decode<T, NestedKeys>(_: NestedDecodable<T, NestedKeys>.Type, forKey key: Key) throws -> NestedDecodable<T, NestedKeys> {
        guard NestedKeys.allCases.isEmpty == false else { throw ... }
        
        var container = try self.nestedContainer(keyedBy: NestedKeys.self, forKey: key)
        NestedKeys.allCases.dropLast().forEach { key in
            container = try container.nestedContainer(keyedBy: NestedKeys.self, forKey: key)
        }
        let wrappedValue = try container.decode(String.self, forKey: NestedKeys.lastCase!)
        return NestedDecodable(wrappedValue: wrappedValue)
    }
}

extension CaseIterable {
    static var lastCase: Self? {
        guard allCases.isEmpty == false else { return nil }
        let lastIndex = allCases.index(allCases.endIndex, offsetBy: -1)
        return allCases[lastIndex]
    }
}
```

Now we can decode our `Contact` type and access its address. The only drawback is that `address` property is not a `String` any more but a `NestedDecodable<String, Contact.AddressCodingKeys>`. We still can access the actual string quite easily with `address.wrappedValue`, but we now would need to do that everywhere, which is nasty.

By now you already noticed thought that our `NestedDecodable` type perfectly matches property wrapper requirements, which is a `wrappedValue` property and `init(wrappedValue:)` initialiser. So we can go on and annotate it without changing anything else:

```swift
@propertyWrapper
struct NestedDecodable<T, Keys: CodingKey & CaseIterable>: Decodable {
    let wrappedValue: T
    init(wrappedValue: T) {
        self.wrappedValue = wrappedValue
    }
}
```

Now we can change how we declare our `address` property and with that we can access it directly as a string without even knowing that it was wrapped in the first place:

```swift
struct Contact: Decodable {
    let id: String
    @NestedDecodable<String, AddressCodingKeys>
    let address: String
    
    enum CodingKeys: String, CodingKey {
        case id
        case address = "user"
    }
    
    enum AddressCodingKeys: String, CodingKey, CaseIterable {
        case details, address
    }
}

let contact = try JSONDecoder().decode(Contact.self, from: jsonData)
contact.address == "Apple St."
```

And that's the main "magic" of property wrappers.

## Decoding multiple nested value

Now when we can decode a single nested value we can declare as many `NestedDecodable` properties as we want, we can even completely get rid of any nested types in our data models and make them all flat (in real life you wouldn't do that of course). Let's try to add another nested property, let's say a name. Our JSON will look like this:

```
{
    "id": "1",
    "user": {
        "details": {
            "address": "Apple St."
            "name": "Jhon Appleseed"
        }
    }
}
```

We will need to add a new property "annotated" with `NestedDecodable` wrapper and coding keys for it:

```swift
struct Contact: Decodable {
    let id: String
    @NestedDecodable<String, AddressCodingKeys>
    let address: String
    @NestedDecodable<String, NameCodingKeys>
    let name: String
    
    enum CodingKeys: String, CodingKey {
        case id
        case address = "user"
        case name = "user"
    }
    
    enum AddressCodingKeys: String, CodingKey, CaseIterable {
        case details, address
    }
    
    enum NameCodingKeys: String, CodingKey, CaseIterable {
        case details, name
    }
}
```

This looks fine but unfortunately does not work as different enum cases can't have the same raw values... So to be able to decode nested values with the same root we need a different way to define their common root key. The only feasible way to do that is to define it separately in each nested keys enum:

```swift
enum CodingKeys: String, CodingKey {
    case id
}
    
enum AddressCodingKeys: String, CodingKey, CaseIterable {
    case user, details, address
}
    
enum NameCodingKeys: String, CodingKey, CaseIterable {
    case user, details, name
}
```

With that we again have a problem that `CodingKeys` does not define all the keys for all the properties in the `Contact` type. But now as we don't need to change their raw values we can leave it to compiler to generate these keys for us and remove `CodingKeys` type completely and only leave nested keys enums. But this means that we can't use compiler generated keys for `address` and `name` when decoding these properties, as their raw values won't be `"user"` any more. We need to use `user` keys from `AddressCodingKeys` and `NameCodingKeys` respectively. But we can't use these keys as they are not `Contact.CodingKeys`... 

Sounds like we are in a dead end. Notice though that all our keys are enums based on `String` raw values. So using the raw value `"user"` we can create either `CodingKeys.user` key, or `NameCodingKeys.user` or `AddressCodingKeys.user`. So what we need to restore our decoding code is to take the first key in `NestedKeys`, get its string value and use it to create a `Key` value. If the raw values of these enum cases match, then this convertion will work perfectly (and if does not - we throw):

```swift
let rootKey = Key(stringValue: NestedKeys.allCases.first!.stringValue)
```

With that we can fix our decoding method:

```swift
extension KeyedDecodingContainer {
    func decode<T, NestedKeys>(_: NestedDecodable<T, NestedKeys>.Type, forKey key: Key) throws -> NestedDecodable<T, NestedKeys> {
        guard NestedKeys.allCases.isEmpty == false else { throw ... }
        
        let wrappedValue = try containerForNestedKey().decode(T.self, forKey: NestedKeys.lastCase!)
        return NestedDecodable(wrappedValue: wrappedValue)
    }
    
    private func containerForNestedKey<K: CodingKey & CaseIterable>() throws -> KeyedDecodingContainer<K> {
        guard let rootKey = Key(stringValue: K.allCases.first!.stringValue) else { throw ... }
        
        var container = try self.nestedContainer(keyedBy: K.self, forKey: rootKey)
        if K.allCases.count > 1 {
            try K.allCases.dropFirst().dropLast().forEach { (key) in
                container = try container.nestedContainer(keyedBy: K.self, forKey: key)
            }
        }
        return container
    }
}
```

That's fine, it compiles now. But we still have one last issue - we still don't have a `CodingKeys.user` key. If we try to define it manually compiler will complain that there is no `Contact.user` property. If we don't do that then compiler won't generate this key for us, so our trick with converting keys from one type to another won't work at runtime. So we have nothing to do but to declare a `user` property to let compiler generate a `user` key for us:

```swift
struct Contact: Decodable {
    let id: String
    @NestedDecodable<String, AddressCodingKeys>
    let address: String
    @NestedDecodable<String, NameCodingKeys>
    let name: String
    
    private let user: ...
}
```

But what should be its type? We don't actually want to decode anything into this property and we definetely don't want to specify it's full type which is `[String: [String: String]]`. We could do that but it will break whole decoding as soon as we start to have nested values of any other types - its type will become `[String: [String: Any]]` for which compiler won't be able to generate decoding code at all.

So as we don't want to have any value in this `user` property can we declare it just as `Void`? We could but `Void` is not `Decodable` and we can't extend it to conform to any protocol. But what we can do is to define our own `Void`. In the end it's just a struct with no members.

```swift
struct Unit: Decodable {
    init() {}
    init(from decoder: Decoder) {}
}

struct Contact: Decodable {
    let id: String
    @NestedDecodable<String, AddressCodingKeys>
    let address: String
    @NestedDecodable<String, NameCodingKeys>
    let name: String
    
    private let user: Unit
}
```

(We could name this type something like `RootKeyPlaceholder` to make its purpose more clear in this context, but `Unit` is a good general type that can be used for other purposes as well)

And now we are really done. Complier will generate a `user` key for us, will automatically decode "nothing" into it and we then will be able to convert our key types and have multiple properties nested under the same root key.

Let's recap and see the final version of the code:

```swift
struct Contact: Decodable {
    let id: String
    @NestedDecodable<String, AddressCodingKeys>
    let address: String
    @NestedDecodable<String, NameCodingKeys>
    let name: String
    
    private let user: Unit
    
    enum AddressCodingKeys: String, CodingKey, CaseIterable {
        case user, details, address
    }
    
    enum NameCodingKeys: String, CodingKey, CaseIterable {
        case user, details, name
    }
}

struct NestedDecodable<T, Keys: CodingKey & CaseIterable>: Decodable {
    let wrappedValue: T
    init(wrappedValue: T) {
        self.wrappedValue = wrappedValue
    }
}

extension KeyedDecodingContainer {
    func decode<T, NestedKeys>(_: NestedDecodable<T, NestedKeys>.Type, forKey key: Key) throws -> NestedDecodable<T, NestedKeys> {
        guard NestedKeys.allCases.isEmpty == false else { throw ... }
        
        let wrappedValue = try containerForNestedKey().decode(T.self, forKey: NestedKeys.lastCase!)
        return NestedDecodable(wrappedValue: wrappedValue)
    }
    
    private func containerForNestedKey<K: CodingKey & CaseIterable>() throws -> KeyedDecodingContainer<K> {
        guard let rootKey = Key(stringValue: K.allCases.first!.stringValue) else { throw ... }
        
        var container = try self.nestedContainer(keyedBy: K.self, forKey: rootKey)
        if K.allCases.count > 1 {
            try K.allCases.dropFirst().dropLast().forEach { (key) in
                container = try container.nestedContainer(keyedBy: K.self, forKey: key)
            }
        }
        return container
    }
}

extension CaseIterable {
    static var lastCase: Self? {
        guard allCases.isEmpty == false else { return nil }
        let lastIndex = allCases.index(allCases.endIndex, offsetBy: -1)
        return allCases[lastIndex]
    }
}

struct Unit: Decodable {
    init() {}
    init(from decoder: Decoder) {}
}
```

## Conclusion

Note that if we have just one nested property per root key we still can use the first version of the code. On the other hand we then will need to define all our keys manually just to provide few custom values, so if there are a lot of properties and just a few nested properties it might be easier to use the second approach. Then we will only need to add `Unit` properties for our root keys. Unfortunately it's not a completely safe solution as we can still make a typo in the name of this property and even in cases for nested keys and it will be possible to catch this only at runtime. But on the other hand Codable is inherently unsafe as we still can have a mismatch between JSON keys and properties names. So this seems like an acceptable nuance.

As an excercise you can now try to implement `Encodable` and `Codable` for encoding nested values. Or you can go and see the full code that supports both encoding and decoding [here](https://gist.github.com/ilyapuchka/52356678ca87b1303a161cecdcf1a240).
