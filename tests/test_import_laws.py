import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from import_laws import parse_html,parse_text,validate,editorial
class ParserTests(unittest.TestCase):
 def test_chapters(self):
  source='<hr><a name="K28">28 kap. Om husrannsakan</a><h4>Husrannsakan</h4><a class="paragraf" name="K28P1"><b>1 §</b></a>Text<br>ny rad<a class="paragraf" name="K28P2"><b>2 §</b></a>Andra'
  result=parse_html(source)
  self.assertEqual(result[0]["number"],"28")
  self.assertEqual(result[0]["items"][0]["nextPara"],"1")
  self.assertIn("ny rad",result[0]["items"][1]["text"])
 def test_chapterless(self):
  result=parse_html('<hr><a class="paragraf" name="P1"><b>1 §</b></a>Text 1<a class="paragraf" name="P2a"><b>2 a §</b></a>Text 2')
  self.assertEqual(result[0]["number"],"0")
  self.assertEqual(result[0]["items"][1]["number"],"2 a")
 def test_duplicate_chapters_are_versioned(self):
  text='<hr><a name="K27">27 kap. Rubrik</a><a class="paragraf" name="K27P1"><b>1 §</b></a>Första lydelsen<a name="K27">27 kap. Rubrik</a><a class="paragraf" name="K27P1"><b>1 §</b></a>Andra lydelsen'
  chapters=parse_html(text)
  self.assertEqual(len(chapters),1)
  self.assertEqual(len(chapters[0]["items"]),1)
  self.assertTrue(chapters[0]["items"][0]["hasVariants"])
 def test_versions(self):
  result=parse_html('<hr><a class="paragraf" name="P1"><b>1 §</b></a>Old<a class="paragraf" name="P1"><b>1 §</b></a>New')
  self.assertTrue(result[0]["items"][0]["hasVariants"])
 def test_fallback(self):
  result=parse_text('28 kap. Rubrik\n1 § Text\nNästa rad\n2 § Andra')
  self.assertEqual(result[0]["number"],"28")
  self.assertIn("Nästa rad",result[0]["items"][0]["text"])
 def test_validation(self):
  with self.assertRaises(ValueError):
   validate([{"number":"0","items":[{"type":"para","number":"1","text":"Text"}]}],"1984:387")
 def test_editorial(self):
  chs=[{"number":"28","title":"","items":[{"type":"para","number":"1","text":"Text"}]}]
  editorial(chs,"1942:740")
  self.assertTrue(chs[0]["items"][0]["editorial"])
if __name__=="__main__":unittest.main()
