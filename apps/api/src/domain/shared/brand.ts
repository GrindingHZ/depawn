declare const brandTag: unique symbol;

export type Brand<Value, Tag extends string> = Value & { readonly [brandTag]: Tag };
