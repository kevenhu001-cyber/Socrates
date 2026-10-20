package com.socrates.android.ui

import org.junit.Assert.*
import org.junit.Test

class MarkdownSourceTest {
    private fun s(value: String) = value.replace('§', '$')
    @Test fun inlineDollarMath() { assertEquals(s("设 §§V_b = 0§§ 为参考"), MarkdownSource.normalize(s("设 §V_b = 0§ 为参考"))) }
    @Test fun parenthesizedMath() { assertEquals(s("§§x_i§§"), MarkdownSource.normalize("\\(x_i\\)")) }
    @Test fun bracketDisplayMath() { assertEquals(s("\n\n§§\n\\boxed{40\\Omega}\n§§\n\n"), MarkdownSource.normalize("\\[\\boxed{40\\Omega}\\]")) }
    @Test fun compactDisplayMath() { assertEquals(s("\n\n§§\nx^2\n§§\n\n"), MarkdownSource.normalize(s("§§x^2§§"))) }
    @Test fun fencedCodeIsOpaque() { val code = s("```kotlin\nval x = \"§value§\"\n```"); assertEquals(code, MarkdownSource.normalize(code)) }
    @Test fun inlineCodeIsOpaque() { val code = s("`\\(x\\) §x§`"); assertEquals(code, MarkdownSource.normalize(code)) }
    @Test fun tildesAreOpaque() { val code = s("~~~\n§x§\n~~~"); assertEquals(code, MarkdownSource.normalize(code)) }
    @Test fun incompleteStreamIsLiteral() { listOf(s("设 §x"), "\\[\\frac{1}", s("```\n§x§")).forEach { assertEquals(it, MarkdownSource.normalize(it)) } }
    @Test fun escapedDollarAndPricesRemainLiteral() { val value = s("花费 \\§5 和 §5 and §10"); assertEquals(value, MarkdownSource.normalize(value)) }
    @Test fun multipleInlineFormulas() { assertEquals(s("§§a§§ 到 §§b§§"), MarkdownSource.normalize(s("§a§ 到 \\(b\\)"))) }
    @Test fun multilineMathKeepsAlignedEnvironment() { val value = "\\[\\begin{aligned}U&=-40\\\\R&=40\\end{aligned}\\]"; assertTrue(MarkdownSource.normalize(value).contains("\\begin{aligned}U&=-40\\\\R&=40\\end{aligned}")) }
}
