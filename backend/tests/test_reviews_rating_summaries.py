"""Batch review summaries preserve the scalar DAL contract."""
import uuid

from database.db import get_conn
from database.reviews_dal import get_rating_summaries, get_rating_summary, init_reviews_schema


def test_batched_review_summaries_match_visible_scalar_results():
    init_reviews_schema()
    target = "rating-target-" + uuid.uuid4().hex
    no_reviews = "rating-empty-" + uuid.uuid4().hex
    with get_conn() as c:
        for rating, visible in ((5, 1), (3, 1), (1, 0)):
            c.execute(
                "INSERT INTO reviews (id,author_id,author_role,target_id,target_role,rating,is_visible) "
                "VALUES (?,?,?,?,?,?,?)",
                (uuid.uuid4().hex, "rating-author", "client", target, "driver", rating, visible),
            )

    batch = get_rating_summaries([target, no_reviews, target, None])
    assert batch[target] == get_rating_summary(target)
    assert batch[no_reviews] == get_rating_summary(no_reviews)
    assert batch[target]["count"] == 2
    assert batch[target]["average"] == 4
    assert batch[no_reviews] == {"count": 0, "average": 0, "distribution": {}}
    assert get_rating_summaries([]) == {}
