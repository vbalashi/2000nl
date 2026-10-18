import unittest
from mwe_benchmark_data import tokenize,align_core
from mwe_score import score,max_match
from mwe_study import validate_extraction,payload_cases,Unit,Review
from pydantic import create_model,Field,ValidationError
from agents.strict_schema import ensure_strict_json_schema
class MWETests(unittest.TestCase):
    def test_discontinuous_core_offsets_preserve_original(self):
        text='Dat hangt van de situatie af.';t=tokenize(text);ids=align_core(t,['hangt','van','af'])
        self.assertEqual(ids,[1,2,5]);self.assertEqual([text[t[i]['start']:t[i]['end']] for i in ids],['hangt','van','af'])
    def test_exact_match_is_not_iou_and_one_to_one(self):
        p=[{'tokenIds':[1,3,5]},{'tokenIds':[1,3,5]}];g=[{'tokenIds':[1,3,5]}]
        self.assertEqual(max_match(p,g)[1],1)
        self.assertEqual(max_match([{'tokenIds':[1,2,3]}],g)[1],0)
        self.assertEqual(max_match([{'tokenIds':[1,3]}],g,True)[1],1)
    def test_optional_neutral_does_not_inflate_required_recall(self):
        ref={'cases':[{'caseId':'a','split':'x','required':[{'canonical':'x','tokenIds':[1,2]}],'optional':[{'canonical':'y','tokenIds':[3,4]}]}]}
        r=score(ref,{'units':[{'caseId':'a','tokenIds':[3,4]}],'invalid':[]})
        self.assertEqual(r['exactCore']['tp'],0);self.assertEqual(r['exactCore']['fp'],0);self.assertEqual(r['exactCore']['fn'],1)
    def test_foreign_duplicate_or_reordered_anchors_rejected(self):
        c={'caseId':'a','tokens':tokenize('Hij belt op.')}
        r=validate_extraction({'cases':[{'caseId':'a','units':[{'tokenIds':[2,1],'canonical':'opbellen'}]},{'caseId':'foreign','units':[]}]},[c])
        self.assertEqual(len(r['units']),0);self.assertEqual(len(r['invalid']),2)
    def test_review_cardinality_enforced_before_results_used(self):
        Batch=create_model('TwoReviews',decisions=(list[Review],Field(min_length=2,max_length=2)))
        with self.assertRaises(ValidationError):Batch.model_validate({'decisions':[{'unitId':'one','verdict':'accept','reason':'fits'}]})
    def test_register_alias_is_required_in_strict_wire_and_roundtrips(self):
        schema=ensure_strict_json_schema(Unit.model_json_schema());self.assertIn('register',schema['required'])
        value=Unit.model_validate({'tokenIds':[1,3],'canonical':'x','category':'idiom','register':'informal','note':'context'})
        self.assertEqual(value.model_dump(by_alias=True)['register'],'informal')
    def test_model_payload_contains_no_reference(self):
        c={'caseId':'a','text':'Hij belt op.','tokens':tokenize('Hij belt op.'),'required':[{'canonical':'secret'}],'optional':[],'split':'challenge','neighbours':[]}
        p=payload_cases([c],'taxonomy',{})[0]
        self.assertEqual(set(p),{'caseId','central','tokens'})
if __name__=='__main__':unittest.main()
