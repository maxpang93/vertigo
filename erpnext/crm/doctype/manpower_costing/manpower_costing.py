# -*- coding: utf-8 -*-
# Copyright (c) 2022, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
# import frappe
from frappe.model.document import Document

class ManpowerCosting(Document):
	def before_save(self):
		self.subtotal=self.qty*self.unit_price
		
