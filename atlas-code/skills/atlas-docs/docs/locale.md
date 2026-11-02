# Locale files in step — translate, locale, i18n, missing translations

Translating a key without knowing where it appears produces words that are correct and
wrong: "Home" as a house in a navigation bar. Every string here is translated from its place
in the product.

## Establish the work

The source locale, the target locales, the files, and the format (JSON, YAML, `.po`,
`.strings`, ARB). Check each file parses before touching it.
The list: keys in the source and missing in a target; keys whose source text changed since
the target was written, by `git log` on the source file when history allows, and reported as
`cannot tell` when it does not; keys in a target and gone from the source, listed and left,
never deleted without a yes.

## Read where it is used

Find each key in the code and read the component around it: is it a button, a heading, an
error, a label read by a screen reader, a fragment joined with another string. Note the
space it has, and what each placeholder holds at run time. Group keys by feature, so one
feature uses one vocabulary.

## Translate

The project's glossary and do-not-translate list first, when it has them: product names,
brand terms, anything in code font. The register the existing translations already use,
formal or informal, kept consistent.
Unchanged, exactly: placeholders (`{name}`, `%s`, `{{count}}`, `<0>…</0>`), their order when
the format is positional, markup, line breaks that carry meaning, key names.
Plurals by the target language's own rules, with every form the format requires; a language
with more plural forms than the source gets all of them.
Length: when the target is much longer than the space allows, say so in the report rather
than shortening into something unclear.
A string whose meaning is not clear from its use is not translated: it is listed as `ask`
with the two readings.

## Apply and check

Edit only the keys on the list. Keep the file's key order, indentation, quoting and final
newline; a diff that reformats the file hides the translation.
After: every file parses; every target has the same keys as the source, or the difference is
on the list; every placeholder in a source string is in its translation. Run the project's
own i18n check or tests when there are any.

## Report

```
locales/it.json   12 added, 3 updated (source changed), 1 ask
  checkout.pay_now        "Paga ora"
  errors.card_declined    "Carta rifiutata"
  ask  nav.home           "Home" — start page or house? used in Sidebar.tsx:14 and Listing.tsx:40
locales/de.json   12 added, 3 updated
orphans           2 keys in it.json not in en.json — left
```

Translations are shown so they can be read by someone who speaks the language; they are the
one thing in this skill that a parser cannot verify.
