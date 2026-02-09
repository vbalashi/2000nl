# SRS History Anomaly Report

- rows analyzed: 784
- unique (word_id, mode): 305
- repeats under 120s: 21
- repeats under 120s with same grade but different interval_after (>1 min): 12

## Top Repeats (word, mode)

- 5x: `lenen` (word-to-definition)
- 3x: `lenen` (definition-to-word)
- 2x: `treffen` (word-to-definition)
- 2x: `lenen voor` (word-to-definition)
- 2x: `voorzichtig` (word-to-definition)
- 1x: `zacht` (definition-to-word)
- 1x: `verlenen` (word-to-definition)
- 1x: `buik` (word-to-definition)
- 1x: `ontlenen aan` (word-to-definition)
- 1x: `activiteit` (word-to-definition)
- 1x: `herkennen` (word-to-definition)
- 1x: `zacht` (word-to-definition)

## Fast Repeats (first 25, dt < 120s)

### treffen (word-to-definition) dt=10.790s

A:
- `reviewed_at`: 2026-02-09T16:01:58.630943+00:00
- `scheduled_at`: 2026-02-08T02:07:42.962021+00:00
- `word`: treffen
- `word_id`: 5924e332-6bbe-40f0-ad18-ce9466c6686f
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 5.882094
- `stability_before/after`: 1.336325 -> 5.882094
- `difficulty_before/after`: 7.015191 -> 7.003404
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: 2.915673
- `metadata.retrievability`: 0.838292
- `metadata.same_day`: False
- `metadata.last_reviewed_at_before`: 2026-02-06T18:03:24.482021+00:00

B:
- `reviewed_at`: 2026-02-09T16:02:09.420945+00:00
- `scheduled_at`: 2026-02-15T13:12:11.552543+00:00
- `word`: treffen
- `word_id`: 5924e332-6bbe-40f0-ad18-ce9466c6686f
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 5.500269
- `stability_before/after`: 5.882094 -> 5.500269
- `difficulty_before/after`: 7.003404 -> 6.991629
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: 0.000125
- `metadata.retrievability`: 0.999997
- `metadata.same_day`: True
- `metadata.last_reviewed_at_before`: 2026-02-09T16:01:58.630943+00:00


### lenen (word-to-definition) dt=13.712s

A:
- `reviewed_at`: 2025-12-12T15:35:20.473375+00:00
- `scheduled_at`: 2025-12-12T14:38:46.289473+00:00
- `word`: lenen
- `word_id`: b7c1edb2-2566-4257-a3b0-c44fa09a91c4
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 4 (easy)
- `interval_after`: 8.2956
- `stability_before/after`: None -> 8.2956
- `difficulty_before/after`: None -> 1.0
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None

B:
- `reviewed_at`: 2025-12-12T15:35:34.184971+00:00
- `scheduled_at`: 2025-12-20T22:41:00.313375+00:00
- `word`: lenen
- `word_id`: b7c1edb2-2566-4257-a3b0-c44fa09a91c4
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 4 (easy)
- `interval_after`: 13.046064691177454
- `stability_before/after`: 8.2956 -> 13.046064691177454
- `difficulty_before/after`: 1.0 -> 1.0
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None


### zacht (definition-to-word) dt=19.322s

A:
- `reviewed_at`: 2025-12-16T12:34:34.172200+00:00
- `scheduled_at`: 2025-12-18T04:10:16.571995+00:00
- `word`: zacht
- `word_id`: 4b589b06-a512-4a8a-9734-6d64b3441b68
- `mode`: definition-to-word
- `review_type`: review
- `grade`: 2 (hard)
- `interval_after`: 1.333379
- `stability_before/after`: 2.3065 -> 1.333379
- `difficulty_before/after`: 2.118104 -> 4.752859
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None

B:
- `reviewed_at`: 2025-12-16T12:34:53.494465+00:00
- `scheduled_at`: 2025-12-17T20:34:38.117800+00:00
- `word`: zacht
- `word_id`: 4b589b06-a512-4a8a-9734-6d64b3441b68
- `mode`: definition-to-word
- `review_type`: review
- `grade`: 4 (easy)
- `interval_after`: 2.364959
- `stability_before/after`: 1.333379 -> 2.364959
- `difficulty_before/after`: 4.752859 -> 2.984737
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None


### buik (word-to-definition) dt=20.098s

A:
- `reviewed_at`: 2026-02-06T18:03:09.588978+00:00
- `scheduled_at`: 2026-02-03T10:08:58.794818+00:00
- `word`: buik
- `word_id`: 65babb9d-a7be-4b5c-9df7-031611593321
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 21.388957
- `stability_before/after`: 9.446053 -> 21.388957
- `difficulty_before/after`: 8.242551 -> 8.229537
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: 12.775345
- `metadata.retrievability`: 0.877955
- `metadata.same_day`: False
- `metadata.last_reviewed_at_before`: 2026-01-24T23:26:39.815618+00:00

B:
- `reviewed_at`: 2026-02-06T18:03:29.686513+00:00
- `scheduled_at`: 2026-02-28T03:23:15.473778+00:00
- `word`: buik
- `word_id`: 65babb9d-a7be-4b5c-9df7-031611593321
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 18.37174
- `stability_before/after`: 21.388957 -> 18.37174
- `difficulty_before/after`: 8.229537 -> 8.216536
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: 0.000233
- `metadata.retrievability`: 0.999998
- `metadata.same_day`: True
- `metadata.last_reviewed_at_before`: 2026-02-06T18:03:09.588978+00:00


### lenen voor (word-to-definition) dt=20.165s

A:
- `reviewed_at`: 2025-12-12T15:53:34.787317+00:00
- `scheduled_at`: 2025-12-12T20:57:28.270065+00:00
- `word`: lenen voor
- `word_id`: bdd3e6d3-9c59-48ff-b337-a19301892f95
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 0.24668918777567275
- `stability_before/after`: 0.212 -> 0.24668918777567275
- `difficulty_before/after`: 6.4133 -> 6.402115069296838
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None

B:
- `reviewed_at`: 2025-12-12T15:53:54.952568+00:00
- `scheduled_at`: 2025-12-12T21:48:48.733141+00:00
- `word`: lenen voor
- `word_id`: bdd3e6d3-9c59-48ff-b337-a19301892f95
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 0.28420635927589494
- `stability_before/after`: 0.24668918777567275 -> 0.28420635927589494
- `difficulty_before/after`: 6.402115069296838 -> 6.3909413235243795
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None


### zacht (word-to-definition) dt=21.183s

A:
- `reviewed_at`: 2026-02-06T18:03:45.496959+00:00
- `scheduled_at`: 2026-02-03T13:56:02.072603+00:00
- `word`: zacht
- `word_id`: c8c396a5-9c31-4db9-b4cb-a2c735a450e9
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 19.336878
- `stability_before/after`: 9.603552 -> 19.336878
- `difficulty_before/after`: 8.761946 -> 8.748412
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: 12.775582
- `metadata.retrievability`: 0.879226
- `metadata.same_day`: False
- `metadata.last_reviewed_at_before`: 2026-01-24T23:26:55.179803+00:00

B:
- `reviewed_at`: 2026-02-06T18:04:06.680249+00:00
- `scheduled_at`: 2026-02-26T02:08:51.756159+00:00
- `word`: zacht
- `word_id`: c8c396a5-9c31-4db9-b4cb-a2c735a450e9
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 16.719731
- `stability_before/after`: 19.336878 -> 16.719731
- `difficulty_before/after`: 8.748412 -> 8.734892
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: 0.000245
- `metadata.retrievability`: 0.999998
- `metadata.same_day`: True
- `metadata.last_reviewed_at_before`: 2026-02-06T18:03:45.496959+00:00


### herkennen (word-to-definition) dt=41.119s

A:
- `reviewed_at`: 2026-02-06T18:49:38.582387+00:00
- `scheduled_at`: 2026-02-05T13:03:12.683725+00:00
- `word`: herkennen
- `word_id`: c3e037ac-44e2-4c63-8382-f5c33d763c06
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 2 (hard)
- `interval_after`: 17.911559
- `stability_before/after`: 12.120547 -> 17.911559
- `difficulty_before/after`: 8.386576 -> 8.914162
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: 13.361125
- `metadata.retrievability`: 0.893167
- `metadata.same_day`: False
- `metadata.last_reviewed_at_before`: 2026-01-24T10:09:37.422925+00:00

B:
- `reviewed_at`: 2026-02-06T18:50:19.701127+00:00
- `scheduled_at`: 2026-02-24T16:42:17.279987+00:00
- `word`: herkennen
- `word_id`: c3e037ac-44e2-4c63-8382-f5c33d763c06
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 15.565546
- `stability_before/after`: 17.911559 -> 15.565546
- `difficulty_before/after`: 8.914162 -> 8.900476
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: 0.000476
- `metadata.retrievability`: 0.999996
- `metadata.same_day`: True
- `metadata.last_reviewed_at_before`: 2026-02-06T18:49:38.582387+00:00


### lenen (word-to-definition) dt=41.292s

A:
- `reviewed_at`: 2025-12-15T17:10:45.572868+00:00
- `scheduled_at`: 2025-12-17T23:55:38.181638+00:00
- `word`: lenen
- `word_id`: 29fb9fa1-39f5-46bc-a90f-4993dff36480
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 2 (hard)
- `interval_after`: 1.320157
- `stability_before/after`: 2.282026 -> 1.320157
- `difficulty_before/after`: 2.104331 -> 4.743715
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None

B:
- `reviewed_at`: 2025-12-15T17:11:26.865128+00:00
- `scheduled_at`: 2025-12-17T00:51:47.137668+00:00
- `word`: lenen
- `word_id`: 29fb9fa1-39f5-46bc-a90f-4993dff36480
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 1.361995
- `stability_before/after`: 1.320157 -> 1.361995
- `difficulty_before/after`: 4.743715 -> 4.7342
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None


### verlenen (word-to-definition) dt=43.165s

A:
- `reviewed_at`: 2025-12-12T15:53:04.423860+00:00
- `scheduled_at`: 2025-12-12T14:38:48.613806+00:00
- `word`: verlenen
- `word_id`: 5aed92ad-138b-44ca-9ef4-a0f7f62c7b8f
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 2.3064999999999998
- `stability_before/after`: None -> 2.3065
- `difficulty_before/after`: None -> 2.118103970459016
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None

B:
- `reviewed_at`: 2025-12-12T15:53:47.588832+00:00
- `scheduled_at`: 2025-12-14T23:14:26.023860+00:00
- `word`: verlenen
- `word_id`: 5aed92ad-138b-44ca-9ef4-a0f7f62c7b8f
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 2.2938144017309425
- `stability_before/after`: 2.3065 -> 2.2938144017309425
- `difficulty_before/after`: 2.118103970459016 -> 2.111214235785395
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None


### voorzichtig (word-to-definition) dt=45.278s

A:
- `reviewed_at`: 2025-12-16T12:15:30.564515+00:00
- `scheduled_at`: 2025-12-17T05:59:59.651757+00:00
- `word`: voorzichtig
- `word_id`: e4230134-a9f8-469f-a746-0e5d3cc51390
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 1.41686
- `stability_before/after`: 1.377162 -> 1.41686
- `difficulty_before/after`: 5.092413 -> 5.082549
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None

B:
- `reviewed_at`: 2025-12-16T12:16:15.842726+00:00
- `scheduled_at`: 2025-12-17T22:15:47.268515+00:00
- `word`: voorzichtig
- `word_id`: e4230134-a9f8-469f-a746-0e5d3cc51390
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 1.454979
- `stability_before/after`: 1.41686 -> 1.454979
- `difficulty_before/after`: 5.082549 -> 5.072695
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None


### lenen (definition-to-word) dt=56.551s

A:
- `reviewed_at`: 2025-12-15T17:10:17.946071+00:00
- `scheduled_at`: 2025-12-18T00:03:41.057288+00:00
- `word`: lenen
- `word_id`: b7c1edb2-2566-4257-a3b0-c44fa09a91c4
- `mode`: definition-to-word
- `review_type`: review
- `grade`: 2 (hard)
- `interval_after`: 1.326526
- `stability_before/after`: 2.293814 -> 1.326526
- `difficulty_before/after`: 2.111214 -> 4.748285
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None

B:
- `reviewed_at`: 2025-12-15T17:11:14.497399+00:00
- `scheduled_at`: 2025-12-17T01:00:29.792471+00:00
- `word`: lenen
- `word_id`: b7c1edb2-2566-4257-a3b0-c44fa09a91c4
- `mode`: definition-to-word
- `review_type`: review
- `grade`: 2 (hard)
- `interval_after`: 0.795286
- `stability_before/after`: 1.326526 -> 0.795286
- `difficulty_before/after`: 4.748285 -> 6.498895
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None


### voorzichtig (word-to-definition) dt=58.934s

A:
- `reviewed_at`: 2025-12-16T12:16:15.842726+00:00
- `scheduled_at`: 2025-12-17T22:15:47.268515+00:00
- `word`: voorzichtig
- `word_id`: e4230134-a9f8-469f-a746-0e5d3cc51390
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 1.454979
- `stability_before/after`: 1.41686 -> 1.454979
- `difficulty_before/after`: 5.082549 -> 5.072695
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None

B:
- `reviewed_at`: 2025-12-16T12:17:14.777018+00:00
- `scheduled_at`: 2025-12-17T23:11:26.028326+00:00
- `word`: voorzichtig
- `word_id`: e4230134-a9f8-469f-a746-0e5d3cc51390
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 4 (easy)
- `interval_after`: 2.565858
- `stability_before/after`: 1.454979 -> 2.565858
- `difficulty_before/after`: 5.072695 -> 3.411448
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None


### lenen (word-to-definition) dt=74.438s

A:
- `reviewed_at`: 2025-12-15T17:09:31.135238+00:00
- `scheduled_at`: 2025-12-17T23:56:46.030403+00:00
- `word`: lenen
- `word_id`: 29fb9fa1-39f5-46bc-a90f-4993dff36480
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 2.282026
- `stability_before/after`: 2.293814 -> 2.282026
- `difficulty_before/after`: 2.111214 -> 2.104331
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None

B:
- `reviewed_at`: 2025-12-15T17:10:45.572868+00:00
- `scheduled_at`: 2025-12-17T23:55:38.181638+00:00
- `word`: lenen
- `word_id`: 29fb9fa1-39f5-46bc-a90f-4993dff36480
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 2 (hard)
- `interval_after`: 1.320157
- `stability_before/after`: 2.282026 -> 1.320157
- `difficulty_before/after`: 2.104331 -> 4.743715
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None


### lenen (word-to-definition) dt=75.140s

A:
- `reviewed_at`: 2025-12-12T15:35:34.184971+00:00
- `scheduled_at`: 2025-12-20T22:41:00.313375+00:00
- `word`: lenen
- `word_id`: b7c1edb2-2566-4257-a3b0-c44fa09a91c4
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 4 (easy)
- `interval_after`: 13.046064691177454
- `stability_before/after`: 8.2956 -> 13.046064691177454
- `difficulty_before/after`: 1.0 -> 1.0
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None

B:
- `reviewed_at`: 2025-12-12T15:36:49.324736+00:00
- `scheduled_at`: 2025-12-25T16:41:54.174289+00:00
- `word`: lenen
- `word_id`: b7c1edb2-2566-4257-a3b0-c44fa09a91c4
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 4 (easy)
- `interval_after`: 19.914659488608077
- `stability_before/after`: 13.046064691177454 -> 19.914659488608077
- `difficulty_before/after`: 1.0 -> 1.0
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None


### lenen voor (word-to-definition) dt=83.317s

A:
- `reviewed_at`: 2025-12-12T15:52:11.470065+00:00
- `scheduled_at`: 2025-12-12T14:38:47.742996+00:00
- `word`: lenen voor
- `word_id`: bdd3e6d3-9c59-48ff-b337-a19301892f95
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 1 (again)
- `interval_after`: 0.212
- `stability_before/after`: None -> 0.212
- `difficulty_before/after`: None -> 6.4133
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None

B:
- `reviewed_at`: 2025-12-12T15:53:34.787317+00:00
- `scheduled_at`: 2025-12-12T20:57:28.270065+00:00
- `word`: lenen voor
- `word_id`: bdd3e6d3-9c59-48ff-b337-a19301892f95
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 0.24668918777567275
- `stability_before/after`: 0.212 -> 0.24668918777567275
- `difficulty_before/after`: 6.4133 -> 6.402115069296838
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None


### ontlenen aan (word-to-definition) dt=86.805s

A:
- `reviewed_at`: 2025-12-15T12:15:21.725791+00:00
- `scheduled_at`: 2025-12-16T07:03:37.374046+00:00
- `word`: ontlenen aan
- `word_id`: 960b03e0-1429-45db-b1f1-3dc3f6d905ee
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 1 (again)
- `interval_after`: 0.216869
- `stability_before/after`: 0.8005350455839325 -> 0.216869
- `difficulty_before/after`: 6.733898182869417 -> 8.911683
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None

B:
- `reviewed_at`: 2025-12-15T12:16:48.530755+00:00
- `scheduled_at`: 2025-12-15T17:27:39.207391+00:00
- `word`: ontlenen aan
- `word_id`: 960b03e0-1429-45db-b1f1-3dc3f6d905ee
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 2 (hard)
- `interval_after`: 0.146473
- `stability_before/after`: 0.216869 -> 0.146473
- `difficulty_before/after`: 8.911683 -> 9.262753
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None


### lenen (definition-to-word) dt=89.120s

A:
- `reviewed_at`: 2025-12-15T16:59:06.407306+00:00
- `scheduled_at`: 2025-12-15T16:58:52.901194+00:00
- `word`: lenen
- `word_id`: b7c1edb2-2566-4257-a3b0-c44fa09a91c4
- `mode`: definition-to-word
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 2.3065
- `stability_before/after`: None -> 2.3065
- `difficulty_before/after`: None -> 2.118104
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None

B:
- `reviewed_at`: 2025-12-15T17:00:35.527688+00:00
- `scheduled_at`: 2025-12-18T00:20:28.007306+00:00
- `word`: lenen
- `word_id`: b7c1edb2-2566-4257-a3b0-c44fa09a91c4
- `mode`: definition-to-word
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 2.293814
- `stability_before/after`: 2.3065 -> 2.293814
- `difficulty_before/after`: 2.118104 -> 2.111214
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None


### lenen (definition-to-word) dt=96.579s

A:
- `reviewed_at`: 2026-02-08T17:16:35.723266+00:00
- `scheduled_at`: 2026-02-07T03:59:03.222089+00:00
- `word`: lenen
- `word_id`: 29fb9fa1-39f5-46bc-a90f-4993dff36480
- `mode`: definition-to-word
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 157.533402
- `stability_before/after`: 39.347106 -> 157.533402
- `difficulty_before/after`: 1.0 -> 1.0
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: 40.900954
- `metadata.retrievability`: 0.897317
- `metadata.same_day`: False
- `metadata.last_reviewed_at_before`: 2025-12-29T19:39:13.263689+00:00

B:
- `reviewed_at`: 2026-02-08T17:18:12.302581+00:00
- `scheduled_at`: 2026-07-16T06:04:41.656066+00:00
- `word`: lenen
- `word_id`: 29fb9fa1-39f5-46bc-a90f-4993dff36480
- `mode`: definition-to-word
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 118.65135
- `stability_before/after`: 157.533402 -> 118.65135
- `difficulty_before/after`: 1.0 -> 1.0
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: 0.001118
- `metadata.retrievability`: 0.999999
- `metadata.same_day`: True
- `metadata.last_reviewed_at_before`: 2026-02-08T17:16:35.723266+00:00


### activiteit (word-to-definition) dt=106.392s

A:
- `reviewed_at`: 2026-01-02T20:57:05.410777+00:00
- `scheduled_at`: 2025-12-31T18:43:29.096697+00:00
- `word`: activiteit
- `word_id`: b3b2f7e3-2fd0-4c84-b57b-b6385059209c
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 2 (hard)
- `interval_after`: 8.474146
- `stability_before/after`: 2.282026 -> 8.474146
- `difficulty_before/after`: 2.104331 -> 4.743715
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: 4.374807
- `metadata.retrievability`: 0.849524
- `metadata.same_day`: False
- `metadata.last_reviewed_at_before`: 2025-12-29T11:57:22.050297+00:00

B:
- `reviewed_at`: 2026-01-02T20:58:51.803218+00:00
- `scheduled_at`: 2026-01-11T08:19:51.625177+00:00
- `word`: activiteit
- `word_id`: b3b2f7e3-2fd0-4c84-b57b-b6385059209c
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 7.735963
- `stability_before/after`: 8.474146 -> 7.735963
- `difficulty_before/after`: 4.743715 -> 4.7342
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: 0.001231
- `metadata.retrievability`: 0.999978
- `metadata.same_day`: True
- `metadata.last_reviewed_at_before`: 2026-01-02T20:57:05.410777+00:00


### treffen (word-to-definition) dt=108.216s

A:
- `reviewed_at`: 2026-02-06T18:01:36.265683+00:00
- `scheduled_at`: 2026-02-03T01:45:20.397687+00:00
- `word`: treffen
- `word_id`: 5924e332-6bbe-40f0-ad18-ce9466c6686f
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 1 (again)
- `interval_after`: 1.293541
- `stability_before/after`: 8.2956 -> 1.293541
- `difficulty_before/after`: 1.0 -> 7.02699
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: 11.973561
- `metadata.retrievability`: 0.87288
- `metadata.same_day`: False
- `metadata.last_reviewed_at_before`: 2026-01-25T18:39:40.557687+00:00

B:
- `reviewed_at`: 2026-02-06T18:03:24.482021+00:00
- `scheduled_at`: 2026-02-08T01:04:18.208083+00:00
- `word`: treffen
- `word_id`: 5924e332-6bbe-40f0-ad18-ce9466c6686f
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 1.336325
- `stability_before/after`: 1.293541 -> 1.336325
- `difficulty_before/after`: 7.02699 -> 7.015191
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: 0.001253
- `metadata.retrievability`: 0.999854
- `metadata.same_day`: True
- `metadata.last_reviewed_at_before`: 2026-02-06T18:01:36.265683+00:00


### lenen (word-to-definition) dt=119.253s

A:
- `reviewed_at`: 2025-12-15T18:41:36.330609+00:00
- `scheduled_at`: 2025-12-17T06:02:35.448009+00:00
- `word`: lenen
- `word_id`: 29fb9fa1-39f5-46bc-a90f-4993dff36480
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 1.513655
- `stability_before/after`: 1.478109 -> 1.513655
- `difficulty_before/after`: 4.705711 -> 4.696234
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None

B:
- `reviewed_at`: 2025-12-15T18:43:35.583539+00:00
- `scheduled_at`: 2025-12-17T07:01:16.122609+00:00
- `word`: lenen
- `word_id`: 29fb9fa1-39f5-46bc-a90f-4993dff36480
- `mode`: word-to-definition
- `review_type`: review
- `grade`: 3 (good)
- `interval_after`: 1.547634
- `stability_before/after`: 1.513655 -> 1.547634
- `difficulty_before/after`: 4.696234 -> 4.686766
- `params_version`: fsrs-6-default
- `metadata.elapsed_days`: None
- `metadata.retrievability`: None
- `metadata.same_day`: None
- `metadata.last_reviewed_at_before`: None


