The diagnosis
Your product model is sound — the interface flattens it. Concretely:

The card screen answers "what am I training?" four times — top Periode/Bron filters, the "Huidige training" summary line, four editable chips, and a Wijzigen button. When five elements claim one job, none reads as the source of truth.
One modal answers four unrelated questions — Zoeken / Lijsten / Statistieken / Instellingen, plus training settings nested inside list management. VanDale 2k shows up simultaneously as a training source, a training list, and a dictionary.
Surfaces aren't 1:1 with intentions. Every symptom (console feeling, bolted-on provenance, visual noise) flows from that.


---

what I like:

Node ID: igvBU is a great example how 'lookup' can look like: simple search with the list of matches and a details card on the right. looks just great. But it should follow agreed system when we show headword, and then render meanings in own blocks each and expand to full block when clicked allowing to get more stats and add lists, etc.




---

what is wrong or not clear

Node ID: c0HMeY shows three-pane view.
We should be able to choose language first, true. Or not necessarily? we might need (or not mignt need) to see all dictionaries from all dictionaries in the platform? VanDale NT2, VanDale Full for Dutch, Oxford, Cambridge for Endlish. And Personal dictionary for everyone. Should this personal dictionary be used for all languages, for word cards, phrase cards? Should we use phrase cards separately or attach them as examples to word cards? Should we cross-link phrase cards and word cards?

the source for training is not a dictionary but a list. as an example, Dictionary = VanDale NT2, and '2k VanDale' list = VanDale NT2 + filter '2k' applied. Or

Today/This week/youtube source/book source -> are all lists, just 'dynamic'. They are created based on metadata collected. If user clicked a word today in youtube video, this information is saved as metadata information inside db, and there are pre-configured lists? But what if we want to 'combined' list like 'today's youtube video words'? Most probably we shouldn't save these lists as an enitities in the 'list' area. Every time we will select/filter what we need.